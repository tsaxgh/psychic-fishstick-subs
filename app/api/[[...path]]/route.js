import { NextResponse } from 'next/server'
import { MongoClient } from 'mongodb'
import { v4 as uuidv4 } from 'uuid'

const MONGO_URL = process.env.MONGO_URL
const DB_NAME = process.env.DB_NAME || 'subshub'

let cachedClient = null
async function getDb() {
  if (!cachedClient) {
    cachedClient = new MongoClient(MONGO_URL)
    await cachedClient.connect()
  }
  return cachedClient.db(DB_NAME)
}

const json = (data, status = 200) => NextResponse.json(data, { status })

// ---------- helpers ----------
const daysBetween = (date) => {
  const now = new Date(); now.setHours(0, 0, 0, 0)
  const d = new Date(date); d.setHours(0, 0, 0, 0)
  return Math.round((d - now) / 86400000)
}
const monthKey = (d) => {
  const dt = new Date(d)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
}
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const computeStatus = (sub) => {
  if (sub.status === 'Cancelled') return 'Cancelled'
  if (!sub.renewalDate) return sub.status || 'Active'
  const diff = daysBetween(sub.renewalDate)
  if (diff < 0) return 'Expired'
  if (diff <= 15) return 'Expiring Soon'
  return 'Active'
}
const monthlyAmount = (d) => {
  const a = Number(d.amount) || 0
  const t = d.subscriptionType || d.renewalFrequency
  if (t === 'Yearly') return a / 12
  if (t === 'Quarterly') return a / 3
  return a
}
// Total credits = sum of credit purchases; consumed = total - remaining
const totalCredits = (sub) => {
  if (Array.isArray(sub.creditPurchases) && sub.creditPurchases.length) {
    return sub.creditPurchases.reduce((s, p) => s + (Number(p.credits) || 0), 0)
  }
  return Number(sub.creditsAvailable || 0)
}
const sanitize = (s) => {
  const { _id, ...rest } = s
  const status = computeStatus(rest)
  const total = totalCredits(rest)
  const remaining = Number(rest.creditsRemaining || 0)
  const consumed = Math.max(0, total - remaining)
  return { ...rest, status, totalCredits: total, creditsConsumed: consumed }
}

async function handler(request, ctx) {
  const params = await ctx.params
  const path = (params?.path || []).join('/')
  const method = request.method
  const db = await getDb()
  const col = db.collection('subscriptions')
  const sourcesCol = db.collection('payment_sources')
  const paymentsCol = db.collection('payments')

  try {
    // ============ SUBSCRIPTIONS ============
    if (method === 'GET' && path === 'subscriptions') {
      const docs = await col.find({}).sort({ renewalDate: 1 }).toArray()
      return json(docs.map(sanitize))
    }
    if (method === 'POST' && path === 'subscriptions') {
      const body = await request.json()
      const now = new Date().toISOString()
      const id = uuidv4()
      const initialCredits = Number(body.creditsAvailable || 0)
      const creditPurchases = initialCredits > 0 ? [{
        id: uuidv4(), type: 'initial', credits: initialCredits,
        amount: Number(body.amount || 0), purchasedAt: now, notes: 'Initial purchase',
      }] : []
      const doc = {
        id, createdAt: now, updatedAt: now,
        purchaseDate: body.purchaseDate || now,
        category: body.category || 'Internal',
        platformName: body.platformName || 'Untitled',
        serviceType: body.serviceType || 'SaaS Tool',
        creditsAvailable: initialCredits,
        creditsRemaining: body.creditsRemaining ?? initialCredits,
        creditPurchases,
        subscriptionType: body.subscriptionType || 'Monthly',
        amount: Number(body.amount || 0),
        currency: body.currency || 'INR',
        paymentMode: body.paymentMode || '',
        paymentSourceId: body.paymentSourceId || null,
        paymentOwner: body.paymentOwner || '',
        autoRenewal: !!body.autoRenewal,
        renewalType: body.autoRenewal ? 'Auto' : (body.renewalType || 'Manual'),
        renewalDate: body.renewalDate || null,
        renewalFrequency: body.renewalFrequency || body.subscriptionType || 'Monthly',
        status: body.status || 'Active',
        username: body.username || '',
        registeredEmail: body.registeredEmail || '',
        adminAccess: body.adminAccess || '',
        notes: body.notes || '',
        clientName: body.clientName || '',
        tags: Array.isArray(body.tags) ? body.tags : [],
      }
      await col.insertOne(doc)
      return json(sanitize(doc), 201)
    }
    if (method === 'PUT' && path.startsWith('subscriptions/') && !path.includes('/credits') && !path.includes('/payments')) {
      const id = path.split('/')[1]
      const body = await request.json()
      delete body._id; delete body.id
      body.updatedAt = new Date().toISOString()
      if (body.amount !== undefined) body.amount = Number(body.amount)
      if (body.autoRenewal !== undefined) body.renewalType = body.autoRenewal ? 'Auto' : 'Manual'
      const r = await col.findOneAndUpdate({ id }, { $set: body }, { returnDocument: 'after' })
      const updated = r?.value || r
      if (!updated) return json({ error: 'Not found' }, 404)
      return json(sanitize(updated))
    }
    if (method === 'DELETE' && path.startsWith('subscriptions/') && path.split('/').length === 2) {
      const id = path.split('/')[1]
      await col.deleteOne({ id })
      await paymentsCol.deleteMany({ subscriptionId: id })
      return json({ ok: true })
    }

    // Add credit purchase / addon: POST /api/subscriptions/:id/credits
    if (method === 'POST' && /^subscriptions\/[^/]+\/credits$/.test(path)) {
      const id = path.split('/')[1]
      const body = await request.json()
      const sub = await col.findOne({ id })
      if (!sub) return json({ error: 'Not found' }, 404)
      const purchase = {
        id: uuidv4(),
        type: body.type || 'addon',
        credits: Number(body.credits || 0),
        amount: Number(body.amount || 0),
        purchasedAt: body.purchasedAt || new Date().toISOString(),
        expiresAt: body.expiresAt || null,
        notes: body.notes || '',
      }
      const cp = Array.isArray(sub.creditPurchases) ? sub.creditPurchases : []
      cp.push(purchase)
      const newAvail = cp.reduce((s, p) => s + (Number(p.credits) || 0), 0)
      const newRemaining = Number(sub.creditsRemaining || 0) + Number(purchase.credits || 0)
      await col.updateOne({ id }, { $set: { creditPurchases: cp, creditsAvailable: newAvail, creditsRemaining: newRemaining, updatedAt: new Date().toISOString() } })
      const updated = await col.findOne({ id })
      return json(sanitize(updated))
    }

    // Update credits remaining only: PATCH /api/subscriptions/:id/credits
    if (method === 'PATCH' && /^subscriptions\/[^/]+\/credits$/.test(path)) {
      const id = path.split('/')[1]
      const body = await request.json()
      await col.updateOne({ id }, { $set: { creditsRemaining: Number(body.creditsRemaining || 0), updatedAt: new Date().toISOString() } })
      const updated = await col.findOne({ id })
      return json(sanitize(updated))
    }

    // ============ PAYMENT SOURCES ============
    if (method === 'GET' && path === 'payment-sources') {
      const sources = await sourcesCol.find({}).toArray()
      const subs = await col.find({}).toArray()
      const enriched = sources.map(s => {
        const { _id, ...src } = s
        const attached = subs.filter(x => x.paymentSourceId === src.id)
        const monthly = attached.reduce((sum, x) => sum + monthlyAmount(x), 0)
        return {
          ...src,
          attachedCount: attached.length,
          monthlySpend: Math.round(monthly),
          yearlySpend: Math.round(monthly * 12),
        }
      })
      return json(enriched)
    }
    if (method === 'POST' && path === 'payment-sources') {
      const body = await request.json()
      const doc = {
        id: uuidv4(),
        name: body.name || 'New Source',
        type: body.type || 'Credit Card',
        bank: body.bank || '',
        last4: body.last4 || '',
        expiryDate: body.expiryDate || '',
        owner: body.owner || '',
        isDefault: !!body.isDefault,
        notes: body.notes || '',
        createdAt: new Date().toISOString(),
      }
      await sourcesCol.insertOne(doc)
      const { _id, ...rest } = doc
      return json(rest, 201)
    }
    if (method === 'PUT' && path.startsWith('payment-sources/')) {
      const id = path.split('/')[1]
      const body = await request.json()
      delete body._id; delete body.id
      await sourcesCol.updateOne({ id }, { $set: body })
      const doc = await sourcesCol.findOne({ id })
      const { _id, ...rest } = doc
      return json(rest)
    }
    if (method === 'DELETE' && path.startsWith('payment-sources/')) {
      const id = path.split('/')[1]
      await sourcesCol.deleteOne({ id })
      await col.updateMany({ paymentSourceId: id }, { $set: { paymentSourceId: null } })
      return json({ ok: true })
    }

    // ============ MANUAL PAYMENTS ============
    // GET /api/payments?month=YYYY-MM  or all
    if (method === 'GET' && path === 'payments') {
      const url = new URL(request.url)
      const monthFilter = url.searchParams.get('month')
      const q = monthFilter ? { month: monthFilter } : {}
      const docs = await paymentsCol.find(q).sort({ paymentDate: -1 }).toArray()
      return json(docs.map(d => { const { _id, ...r } = d; return r }))
    }
    // POST /api/payments - mark payment
    if (method === 'POST' && path === 'payments') {
      const body = await request.json()
      const doc = {
        id: uuidv4(),
        subscriptionId: body.subscriptionId,
        month: body.month, // YYYY-MM
        status: body.status || 'Paid',
        paymentDate: body.paymentDate || new Date().toISOString(),
        transactionId: body.transactionId || '',
        amount: Number(body.amount || 0),
        paymentSourceId: body.paymentSourceId || null,
        notes: body.notes || '',
        createdAt: new Date().toISOString(),
      }
      // Upsert by subscriptionId+month
      await paymentsCol.deleteOne({ subscriptionId: doc.subscriptionId, month: doc.month })
      await paymentsCol.insertOne(doc)
      const { _id, ...rest } = doc
      return json(rest, 201)
    }
    if (method === 'DELETE' && path.startsWith('payments/')) {
      const id = path.split('/')[1]
      await paymentsCol.deleteOne({ id })
      return json({ ok: true })
    }

    // ============ DASHBOARD STATS ============
    if (method === 'GET' && path === 'dashboard/stats') {
      const docs = (await col.find({}).toArray()).map(sanitize)
      const allPayments = (await paymentsCol.find({}).toArray()).map(d => { const { _id, ...r } = d; return r })
      const active = docs.filter(d => d.status === 'Active' || d.status === 'Expiring Soon').length
      const expired = docs.filter(d => d.status === 'Expired').length
      const expiringSoon = docs.filter(d => d.status === 'Expiring Soon').length
      const autoRenewalCount = docs.filter(d => d.autoRenewal).length
      const aiCredits = docs.filter(d => d.serviceType === 'AI Tool').reduce((s, d) => s + (Number(d.creditsRemaining) || 0), 0)
      const monthlySpend = docs.filter(d => d.status !== 'Cancelled' && d.status !== 'Expired').reduce((s, d) => s + monthlyAmount(d), 0)
      const upcoming = docs.filter(d => {
        if (!d.renewalDate) return false
        const diff = daysBetween(d.renewalDate)
        return diff >= 0 && diff <= 30
      }).length

      // Manual payments tracking
      const thisMonth = monthKey(new Date())
      const manualSubs = docs.filter(d => d.renewalType === 'Manual' || !d.autoRenewal)
      const paidThisMonth = allPayments.filter(p => p.month === thisMonth && p.status === 'Paid').length
      const pendingThisMonth = manualSubs.filter(s => s.status !== 'Cancelled' && s.status !== 'Expired')
        .filter(s => !allPayments.find(p => p.subscriptionId === s.id && p.month === thisMonth && p.status === 'Paid')).length
      const avgCost = docs.length ? Math.round(docs.reduce((s, d) => s + (Number(d.amount) || 0), 0) / docs.length) : 0

      // Top expensive
      const topExpensive = [...docs].sort((a, b) => monthlyAmount(b) - monthlyAmount(a)).slice(0, 5)
        .map(d => ({ id: d.id, platformName: d.platformName, monthlyCost: Math.round(monthlyAmount(d)), category: d.category }))

      return json({
        activeSubscriptions: active,
        monthlySpend: Math.round(monthlySpend),
        annualSpend: Math.round(monthlySpend * 12),
        upcomingRenewals: upcoming,
        expired, expiringSoon,
        aiCreditsRemaining: aiCredits,
        autoRenewalCount,
        manualPending: pendingThisMonth,
        paidThisMonth,
        totalSubscriptions: docs.length,
        avgCost,
        topExpensive,
      })
    }

    // GET /api/dashboard/upcoming
    if (method === 'GET' && path === 'dashboard/upcoming') {
      const docs = (await col.find({}).toArray()).map(sanitize)
      const buckets = {}
      const now = new Date()
      for (let i = 0; i < 6; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
        buckets[monthKey(d)] = { month: `${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}`, key: monthKey(d), total: 0, items: [] }
      }
      docs.forEach(d => {
        if (!d.renewalDate || d.status === 'Cancelled') return
        const k = monthKey(d.renewalDate)
        if (buckets[k]) {
          buckets[k].total += Number(d.amount) || 0
          buckets[k].items.push({ id: d.id, platform: d.platformName, amount: d.amount, renewalDate: d.renewalDate })
        }
      })
      return json(Object.values(buckets))
    }

    // GET /api/dashboard/analytics
    if (method === 'GET' && path === 'dashboard/analytics') {
      const docs = (await col.find({}).toArray()).map(sanitize)
      const byCategory = {}
      const byServiceType = {}
      const trend = {}
      docs.forEach(d => {
        if (d.status === 'Cancelled') return
        const a = Number(d.amount) || 0
        byCategory[d.category] = (byCategory[d.category] || 0) + a
        byServiceType[d.serviceType] = (byServiceType[d.serviceType] || 0) + a
        if (d.renewalDate) {
          const k = monthKey(d.renewalDate)
          trend[k] = (trend[k] || 0) + a
        }
      })
      const now = new Date()
      const trendArr = []
      for (let i = -2; i <= 9; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
        const k = monthKey(d)
        trendArr.push({ month: MONTH_SHORT[d.getMonth()], amount: trend[k] || 0 })
      }
      return json({
        byCategory: Object.entries(byCategory).map(([name, value]) => ({ name, value })),
        byServiceType: Object.entries(byServiceType).map(([name, value]) => ({ name, value })),
        trend: trendArr,
      })
    }

    // GET /api/dashboard/insights - smart computed insights
    if (method === 'GET' && path === 'dashboard/insights') {
      const docs = (await col.find({}).toArray()).map(sanitize)
      const allPayments = (await paymentsCol.find({}).toArray()).map(d => { const { _id, ...r } = d; return r })
      const insights = []
      const thisMonth = monthKey(new Date())
      const nextMonthDate = new Date(); nextMonthDate.setMonth(nextMonthDate.getMonth() + 1)
      const nextMonth = monthKey(nextMonthDate)

      // 1. Renewals next 30 days
      const upcoming30 = docs.filter(d => {
        if (!d.renewalDate || d.status === 'Cancelled') return false
        const diff = daysBetween(d.renewalDate); return diff >= 0 && diff <= 30
      })
      if (upcoming30.length > 0) {
        const total = upcoming30.reduce((s, d) => s + (Number(d.amount) || 0), 0)
        insights.push({ icon: 'calendar', tone: 'info', title: `${upcoming30.length} renewals in next 30 days`, detail: `Total liability ₹${total.toLocaleString('en-IN')}` })
      }

      // 2. Low AI credits prediction
      docs.filter(d => d.serviceType === 'AI Tool' && d.creditsAvailable).forEach(d => {
        const pct = (Number(d.creditsRemaining) / Number(d.creditsAvailable)) * 100
        if (pct < 25 && pct > 0) {
          // Estimate exhaustion based on burn rate (simple: assume 30 days for full cycle)
          const remaining = Number(d.creditsRemaining)
          const consumed = Number(d.creditsAvailable) - remaining
          const daysSincePurchase = d.purchaseDate ? Math.max(1, daysBetween(d.purchaseDate) * -1) : 30
          const burnRate = consumed / Math.max(1, daysSincePurchase)
          const daysLeft = burnRate > 0 ? Math.round(remaining / burnRate) : null
          insights.push({
            icon: 'zap', tone: 'warn',
            title: `${d.platformName} credits low (${Math.round(pct)}%)`,
            detail: daysLeft ? `Estimated exhaustion in ${daysLeft} days` : `${remaining} credits remaining`,
          })
        } else if (pct === 0) {
          insights.push({ icon: 'alert', tone: 'danger', title: `${d.platformName} out of credits`, detail: 'Top-up recommended' })
        }
      })

      // 3. Spend forecast - next month vs this month
      const spendForMonth = (mk) => docs.filter(d => d.renewalDate && monthKey(d.renewalDate) === mk && d.status !== 'Cancelled').reduce((s, d) => s + (Number(d.amount) || 0), 0)
      const thisMonthSpend = spendForMonth(thisMonth)
      const nextMonthSpend = spendForMonth(nextMonth)
      if (nextMonthSpend > thisMonthSpend && nextMonthSpend > 0) {
        const diff = nextMonthSpend - thisMonthSpend
        insights.push({ icon: 'trend', tone: 'info', title: `Spending will increase by ₹${diff.toLocaleString('en-IN')} next month`, detail: `₹${thisMonthSpend.toLocaleString('en-IN')} → ₹${nextMonthSpend.toLocaleString('en-IN')}` })
      }

      // 4. Manual pending payments
      const manualSubs = docs.filter(d => (d.renewalType === 'Manual' || !d.autoRenewal) && d.status !== 'Cancelled' && d.status !== 'Expired')
      const pending = manualSubs.filter(s => !allPayments.find(p => p.subscriptionId === s.id && p.month === thisMonth && p.status === 'Paid'))
      if (pending.length > 0) {
        insights.push({ icon: 'wallet', tone: 'warn', title: `${pending.length} manual payment${pending.length > 1 ? 's' : ''} pending this month`, detail: pending.slice(0, 3).map(s => s.platformName).join(', ') + (pending.length > 3 ? '...' : '') })
      }

      // 5. Duplicates
      const nameGroups = {}
      docs.forEach(d => {
        const key = (d.platformName || '').toLowerCase().trim()
        if (!key) return
        nameGroups[key] = (nameGroups[key] || 0) + 1
      })
      const dups = Object.entries(nameGroups).filter(([k, v]) => v > 1)
      if (dups.length > 0) {
        insights.push({ icon: 'alert', tone: 'warn', title: `${dups.length} potential duplicate subscription${dups.length > 1 ? 's' : ''}`, detail: dups.map(([k]) => k).slice(0, 3).join(', ') })
      }

      // 6. Expired needs attention
      const expired = docs.filter(d => d.status === 'Expired')
      if (expired.length > 0) {
        insights.push({ icon: 'alert', tone: 'danger', title: `${expired.length} subscription${expired.length > 1 ? 's' : ''} expired`, detail: expired.slice(0, 3).map(s => s.platformName).join(', ') })
      }

      // 7. Healthy auto-renew ratio
      const autoCount = docs.filter(d => d.autoRenewal && d.status !== 'Cancelled').length
      const total = docs.filter(d => d.status !== 'Cancelled').length
      if (total > 0) {
        const pct = Math.round((autoCount / total) * 100)
        insights.push({ icon: 'check', tone: 'success', title: `${pct}% subscriptions auto-renew`, detail: `${autoCount} of ${total} active subs are on auto-pay` })
      }

      return json(insights.slice(0, 8))
    }

    // ============ PAYMENTS GRID ============
    // GET /api/payments/grid - returns last 6 months grid
    if (method === 'GET' && path === 'payments/grid') {
      const docs = (await col.find({}).toArray()).map(sanitize)
      const allPayments = (await paymentsCol.find({}).toArray()).map(d => { const { _id, ...r } = d; return r })
      const now = new Date()
      const months = []
      for (let i = -5; i <= 0; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
        months.push({ key: monthKey(d), label: `${MONTH_SHORT[d.getMonth()]} ${String(d.getFullYear()).slice(-2)}` })
      }
      const manualSubs = docs.filter(d => (d.renewalType === 'Manual' || !d.autoRenewal) && d.status !== 'Cancelled')
      const rows = manualSubs.map(s => {
        const row = { id: s.id, platformName: s.platformName, amount: s.amount, paymentOwner: s.paymentOwner, paymentSourceId: s.paymentSourceId, months: {} }
        months.forEach(m => {
          const p = allPayments.find(p => p.subscriptionId === s.id && p.month === m.key)
          row.months[m.key] = p ? { status: p.status, paymentDate: p.paymentDate, transactionId: p.transactionId, id: p.id } : { status: 'Pending' }
        })
        return row
      })
      return json({ months, rows })
    }

    // ============ SEED ============
    if (method === 'POST' && path === 'seed') {
      await col.deleteMany({})
      await sourcesCol.deleteMany({})
      await paymentsCol.deleteMany({})
      const today = new Date()
      const inDays = (n) => { const d = new Date(today); d.setDate(d.getDate() + n); return d.toISOString() }

      // Payment sources
      const sources = [
        { id: uuidv4(), name: 'HDFC Credit Card', type: 'Credit Card', bank: 'HDFC', last4: '4521', owner: 'Rohit', isDefault: true, expiryDate: '12/27', createdAt: new Date().toISOString() },
        { id: uuidv4(), name: 'Axis Card', type: 'Credit Card', bank: 'Axis Bank', last4: '8901', owner: 'Priya', isDefault: false, expiryDate: '08/26', createdAt: new Date().toISOString() },
        { id: uuidv4(), name: 'ICICI Account', type: 'Bank', bank: 'ICICI', last4: '2310', owner: 'Aman', isDefault: false, createdAt: new Date().toISOString() },
        { id: uuidv4(), name: 'UPI - Razorpay', type: 'UPI', bank: '', last4: '', owner: 'Rohit', isDefault: false, createdAt: new Date().toISOString() },
      ]
      await sourcesCol.insertMany(sources)
      const [hdfc, axis, icici, upi] = sources

      const demo = [
        { platformName: 'ChatGPT Team', serviceType: 'AI Tool', category: 'Internal', amount: 1700, subscriptionType: 'Monthly', renewalDate: inDays(5), autoRenewal: false, renewalType: 'Manual', paymentOwner: 'Rohit', paymentSourceId: hdfc.id,
          creditPurchases: [
            { id: uuidv4(), type: 'initial', credits: 5000, amount: 1700, purchasedAt: inDays(-90), notes: 'Plan purchase' },
            { id: uuidv4(), type: 'addon', credits: 2000, amount: 800, purchasedAt: inDays(-30), notes: 'Top-up' },
            { id: uuidv4(), type: 'addon', credits: 500, amount: 250, purchasedAt: inDays(-10), notes: 'Quick top-up' },
          ], creditsRemaining: 1700, tags: ['ai','team'] },
        { platformName: 'Claude Pro', serviceType: 'AI Tool', category: 'Internal', amount: 1800, subscriptionType: 'Monthly', renewalDate: inDays(12), autoRenewal: true, renewalType: 'Auto', paymentOwner: 'Rohit', paymentSourceId: hdfc.id,
          creditPurchases: [{ id: uuidv4(), type: 'initial', credits: 200, amount: 1800, purchasedAt: inDays(-12) }], creditsRemaining: 145, tags: ['ai'] },
        { platformName: 'Cursor Pro', serviceType: 'AI Tool', category: 'Internal', amount: 1650, subscriptionType: 'Monthly', renewalDate: inDays(20), autoRenewal: true, renewalType: 'Auto', paymentOwner: 'Priya', paymentSourceId: axis.id,
          creditPurchases: [{ id: uuidv4(), type: 'initial', credits: 500, amount: 1650, purchasedAt: inDays(-10) }], creditsRemaining: 380 },
        { platformName: 'Midjourney', serviceType: 'AI Tool', category: 'Agency', amount: 2400, subscriptionType: 'Monthly', renewalDate: inDays(2), autoRenewal: false, renewalType: 'Manual', paymentOwner: 'Aman', paymentSourceId: icici.id,
          creditPurchases: [{ id: uuidv4(), type: 'initial', credits: 200, amount: 2400, purchasedAt: inDays(-28) }], creditsRemaining: 8 },
        { platformName: 'GoDaddy - example.com', serviceType: 'Domain', category: 'Client', amount: 1199, subscriptionType: 'Yearly', renewalDate: inDays(45), autoRenewal: true, renewalType: 'Auto', paymentOwner: 'Rohit', paymentSourceId: hdfc.id, clientName: 'Acme Corp' },
        { platformName: 'Hostinger VPS', serviceType: 'VPS', category: 'Agency', amount: 18000, subscriptionType: 'Yearly', renewalDate: inDays(120), autoRenewal: true, renewalType: 'Auto', paymentOwner: 'Rohit', paymentSourceId: hdfc.id },
        { platformName: 'Figma Org', serviceType: 'SaaS Tool', category: 'Agency', amount: 15000, subscriptionType: 'Yearly', renewalDate: inDays(80), autoRenewal: false, renewalType: 'Manual', paymentOwner: 'Priya', paymentSourceId: axis.id },
        { platformName: 'Notion Team', serviceType: 'Workspace', category: 'Agency', amount: 6000, subscriptionType: 'Yearly', renewalDate: inDays(28), autoRenewal: true, renewalType: 'Auto', paymentOwner: 'Priya', paymentSourceId: axis.id },
        { platformName: 'Slack Pro', serviceType: 'Communication Tool', category: 'Agency', amount: 8200, subscriptionType: 'Yearly', renewalDate: inDays(150), autoRenewal: true, renewalType: 'Auto', paymentOwner: 'Aman', paymentSourceId: icici.id },
        { platformName: 'Google Workspace', serviceType: 'Workspace', category: 'Agency', amount: 24000, subscriptionType: 'Yearly', renewalDate: inDays(60), autoRenewal: true, renewalType: 'Auto', paymentOwner: 'Rohit', paymentSourceId: hdfc.id },
        { platformName: 'HubSpot CRM', serviceType: 'CRM', category: 'Agency', amount: 36000, subscriptionType: 'Yearly', renewalDate: inDays(90), autoRenewal: false, renewalType: 'Manual', paymentOwner: 'Priya', paymentSourceId: axis.id },
        { platformName: 'Meta Ads Manager', serviceType: 'Marketing Tool', category: 'Client', amount: 25000, subscriptionType: 'Monthly', renewalDate: inDays(7), autoRenewal: false, renewalType: 'Manual', paymentOwner: 'Aman', paymentSourceId: upi.id, clientName: 'Zenith Inc' },
        { platformName: 'ElevenLabs', serviceType: 'AI Tool', category: 'Internal', amount: 950, subscriptionType: 'Monthly', renewalDate: inDays(18), autoRenewal: true, renewalType: 'Auto', paymentOwner: 'Rohit', paymentSourceId: hdfc.id,
          creditPurchases: [{ id: uuidv4(), type: 'initial', credits: 30000, amount: 950, purchasedAt: inDays(-12) }], creditsRemaining: 22000 },
        { platformName: 'Perplexity Pro', serviceType: 'AI Tool', category: 'Internal', amount: 1650, subscriptionType: 'Monthly', renewalDate: inDays(-3), autoRenewal: false, renewalType: 'Manual', paymentOwner: 'Aman', paymentSourceId: upi.id,
          creditPurchases: [{ id: uuidv4(), type: 'initial', credits: 600, amount: 1650, purchasedAt: inDays(-33) }], creditsRemaining: 0 },
        { platformName: 'Emergent.sh', serviceType: 'AI Tool', category: 'Agency', amount: 2500, subscriptionType: 'Monthly', renewalDate: inDays(14), autoRenewal: true, renewalType: 'Auto', paymentOwner: 'Rohit', paymentSourceId: hdfc.id,
          creditPurchases: [{ id: uuidv4(), type: 'initial', credits: 1000, amount: 2500, purchasedAt: inDays(-16) }], creditsRemaining: 720 },
      ]
      const now = new Date().toISOString()
      const docs = demo.map(d => ({
        id: uuidv4(), createdAt: now, updatedAt: now,
        purchaseDate: d.creditPurchases?.[0]?.purchasedAt || now, currency: 'INR', paymentMode: 'Credit Card',
        registeredEmail: 'finance@agency.com', username: 'agency_admin',
        adminAccess: '', notes: '', clientName: '', tags: [], creditPurchases: [],
        ...d,
        creditsAvailable: (d.creditPurchases || []).reduce((s, p) => s + (Number(p.credits) || 0), 0),
        renewalFrequency: d.subscriptionType, status: 'Active',
      }))
      await col.insertMany(docs)

      // Seed some manual payment history
      const chatgpt = docs.find(d => d.platformName === 'ChatGPT Team')
      const midjourney = docs.find(d => d.platformName === 'Midjourney')
      const meta = docs.find(d => d.platformName === 'Meta Ads Manager')
      const figma = docs.find(d => d.platformName === 'Figma Org')
      const histPayments = []
      const monthOffset = (n) => {
        const d = new Date(); d.setMonth(d.getMonth() + n); return monthKey(d)
      }
      if (chatgpt) {
        ;[-5,-4,-3,-2,-1].forEach((m, i) => {
          if (i === 2) return // pending one
          histPayments.push({ id: uuidv4(), subscriptionId: chatgpt.id, month: monthOffset(m), status: 'Paid', paymentDate: inDays(m*30 + 5), transactionId: `TXN${Math.floor(Math.random()*1e8)}`, amount: chatgpt.amount, paymentSourceId: chatgpt.paymentSourceId, notes: '', createdAt: now })
        })
      }
      if (midjourney) {
        ;[-3,-2,-1].forEach(m => {
          histPayments.push({ id: uuidv4(), subscriptionId: midjourney.id, month: monthOffset(m), status: 'Paid', paymentDate: inDays(m*30 + 2), transactionId: `TXN${Math.floor(Math.random()*1e8)}`, amount: midjourney.amount, paymentSourceId: midjourney.paymentSourceId, notes: '', createdAt: now })
        })
      }
      if (meta) {
        ;[-4,-3,-2].forEach(m => {
          histPayments.push({ id: uuidv4(), subscriptionId: meta.id, month: monthOffset(m), status: 'Paid', paymentDate: inDays(m*30 + 7), transactionId: `TXN${Math.floor(Math.random()*1e8)}`, amount: meta.amount, paymentSourceId: meta.paymentSourceId, notes: '', createdAt: now })
        })
      }
      if (figma) {
        ;[-2,-1].forEach(m => {
          histPayments.push({ id: uuidv4(), subscriptionId: figma.id, month: monthOffset(m), status: 'Paid', paymentDate: inDays(m*30 + 3), transactionId: `TXN${Math.floor(Math.random()*1e8)}`, amount: Math.round(figma.amount/12), paymentSourceId: figma.paymentSourceId, notes: '', createdAt: now })
        })
      }
      if (histPayments.length) await paymentsCol.insertMany(histPayments)

      return json({ inserted: docs.length, sources: sources.length, payments: histPayments.length })
    }

    return json({ error: 'Not found', path, method }, 404)
  } catch (e) {
    console.error(e)
    return json({ error: e.message }, 500)
  }
}

export { handler as GET, handler as POST, handler as PUT, handler as DELETE, handler as PATCH }
