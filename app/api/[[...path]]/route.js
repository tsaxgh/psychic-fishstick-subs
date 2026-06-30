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
  // Manual override statuses preserved
  if (sub.status === 'Cancelled' || sub.status === 'Hold') return sub.status
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
  const paidMonths = Array.isArray(rest.paidMonths) ? rest.paidMonths : []
  const thisMonth = monthKey(new Date())
  return {
    ...rest, status,
    totalCredits: total,
    creditsConsumed: consumed,
    paidMonths,
    isPaidThisMonth: paidMonths.includes(thisMonth),
  }
}

async function handler(request, ctx) {
  const params = await ctx.params
  const path = (params?.path || []).join('/')
  const method = request.method
  const db = await getDb()
  const col = db.collection('subscriptions')
  const sourcesCol = db.collection('payment_sources')
  const paymentsCol = db.collection('payments')
  const notifsCol = db.collection('notifications')

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
        paidMonths: [],
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

    // Credits
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

    // ============ PAYMENT SOURCES ============
    if (method === 'GET' && path === 'payment-sources') {
      const sources = await sourcesCol.find({}).toArray()
      const subs = await col.find({}).toArray()
      const enriched = sources.map(s => {
        const { _id, ...src } = s
        const attached = subs.filter(x => x.paymentSourceId === src.id)
        const monthly = attached.reduce((sum, x) => sum + monthlyAmount(x), 0)
        return { ...src, attachedCount: attached.length, monthlySpend: Math.round(monthly), yearlySpend: Math.round(monthly * 12) }
      })
      return json(enriched)
    }
    if (method === 'POST' && path === 'payment-sources') {
      const body = await request.json()
      const doc = {
        id: uuidv4(), name: body.name || 'New Source', type: body.type || 'Credit Card',
        bank: body.bank || '', last4: body.last4 || '', expiryDate: body.expiryDate || '',
        owner: body.owner || '', isDefault: !!body.isDefault, notes: body.notes || '',
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
    if (method === 'GET' && path === 'payments') {
      const url = new URL(request.url)
      const monthFilter = url.searchParams.get('month')
      const q = monthFilter ? { month: monthFilter } : {}
      const docs = await paymentsCol.find(q).sort({ paymentDate: -1 }).toArray()
      return json(docs.map(d => { const { _id, ...r } = d; return r }))
    }
    // Mark payment - also update subscription's paidMonths
    if (method === 'POST' && path === 'payments') {
      const body = await request.json()
      const doc = {
        id: uuidv4(),
        subscriptionId: body.subscriptionId,
        month: body.month,
        status: body.status || 'Paid',
        paymentDate: body.paymentDate || new Date().toISOString(),
        transactionId: body.transactionId || '',
        amount: Number(body.amount || 0),
        paymentSourceId: body.paymentSourceId || null,
        notes: body.notes || '',
        createdAt: new Date().toISOString(),
      }
      await paymentsCol.deleteOne({ subscriptionId: doc.subscriptionId, month: doc.month })
      await paymentsCol.insertOne(doc)
      // Reflect on subscription
      await col.updateOne(
        { id: doc.subscriptionId },
        { $addToSet: { paidMonths: doc.month }, $set: { lastPaymentDate: doc.paymentDate, updatedAt: new Date().toISOString() } }
      )
      // Notification
      const sub = await col.findOne({ id: doc.subscriptionId })
      await notifsCol.insertOne({
        id: uuidv4(), type: 'payment', tone: 'success',
        title: `${sub?.platformName || 'Subscription'} marked paid`,
        detail: `${MONTH_SHORT[Number(doc.month.slice(5, 7)) - 1]} ${doc.month.slice(0, 4)} · ${doc.transactionId || 'No TXN'}`,
        createdAt: new Date().toISOString(), read: false,
      })
      const { _id, ...rest } = doc
      return json(rest, 201)
    }
    if (method === 'DELETE' && path.startsWith('payments/')) {
      const id = path.split('/')[1]
      const p = await paymentsCol.findOne({ id })
      await paymentsCol.deleteOne({ id })
      if (p) {
        await col.updateOne({ id: p.subscriptionId }, { $pull: { paidMonths: p.month } })
      }
      return json({ ok: true })
    }

    // ============ NOTIFICATIONS ============
    if (method === 'GET' && path === 'notifications') {
      const docs = await notifsCol.find({}).sort({ createdAt: -1 }).limit(30).toArray()
      return json(docs.map(d => { const { _id, ...r } = d; return r }))
    }
    if (method === 'POST' && path === 'notifications/read-all') {
      await notifsCol.updateMany({ read: false }, { $set: { read: true } })
      return json({ ok: true })
    }

    // ============ DASHBOARD STATS ============
    if (method === 'GET' && path === 'dashboard/stats') {
      const docs = (await col.find({}).toArray()).map(sanitize)
      const allPayments = (await paymentsCol.find({}).toArray()).map(d => { const { _id, ...r } = d; return r })
      const active = docs.filter(d => d.status === 'Active' || d.status === 'Expiring Soon').length
      const expired = docs.filter(d => d.status === 'Expired').length
      const expiringSoon = docs.filter(d => d.status === 'Expiring Soon').length
      const onHold = docs.filter(d => d.status === 'Hold').length
      const autoRenewalCount = docs.filter(d => d.autoRenewal && d.status !== 'Cancelled').length
      const aiCredits = docs.filter(d => d.serviceType === 'AI Tool').reduce((s, d) => s + (Number(d.creditsRemaining) || 0), 0)
      const monthlySpend = docs.filter(d => d.status !== 'Cancelled' && d.status !== 'Expired' && d.status !== 'Hold').reduce((s, d) => s + monthlyAmount(d), 0)
      const upcoming = docs.filter(d => {
        if (!d.renewalDate || d.status === 'Cancelled' || d.status === 'Hold') return false
        const diff = daysBetween(d.renewalDate)
        return diff >= 0 && diff <= 30
      }).length

      const thisMonth = monthKey(new Date())
      const manualSubs = docs.filter(d => (d.renewalType === 'Manual' || !d.autoRenewal) && d.status !== 'Cancelled' && d.status !== 'Hold')
      const paidThisMonth = allPayments.filter(p => p.month === thisMonth && p.status === 'Paid').length
      const pendingThisMonth = manualSubs.filter(s => s.status !== 'Expired')
        .filter(s => !s.paidMonths.includes(thisMonth)).length
      const avgCost = docs.length ? Math.round(docs.reduce((s, d) => s + (Number(d.amount) || 0), 0) / docs.length) : 0

      const topExpensive = [...docs].sort((a, b) => monthlyAmount(b) - monthlyAmount(a)).slice(0, 5)
        .map(d => ({ id: d.id, platformName: d.platformName, monthlyCost: Math.round(monthlyAmount(d)), category: d.category }))

      return json({
        activeSubscriptions: active,
        monthlySpend: Math.round(monthlySpend),
        annualSpend: Math.round(monthlySpend * 12),
        upcomingRenewals: upcoming,
        expired, expiringSoon, onHold,
        aiCreditsRemaining: aiCredits,
        autoRenewalCount,
        manualPending: pendingThisMonth,
        paidThisMonth,
        totalSubscriptions: docs.length,
        avgCost,
        topExpensive,
      })
    }

    if (method === 'GET' && path === 'dashboard/upcoming') {
      const docs = (await col.find({}).toArray()).map(sanitize)
      const buckets = {}
      const now = new Date()
      for (let i = 0; i < 6; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
        buckets[monthKey(d)] = { month: `${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}`, monthShort: MONTH_SHORT[d.getMonth()], year: d.getFullYear(), key: monthKey(d), total: 0, items: [] }
      }
      docs.forEach(d => {
        if (!d.renewalDate || d.status === 'Cancelled' || d.status === 'Hold') return
        const k = monthKey(d.renewalDate)
        if (buckets[k]) {
          buckets[k].total += Number(d.amount) || 0
          buckets[k].items.push({ id: d.id, platform: d.platformName, amount: d.amount, renewalDate: d.renewalDate, category: d.category })
        }
      })
      return json(Object.values(buckets))
    }

    if (method === 'GET' && path === 'dashboard/analytics') {
      const docs = (await col.find({}).toArray()).map(sanitize)
      const byCategory = {}, byServiceType = {}, trend = {}
      docs.forEach(d => {
        if (d.status === 'Cancelled' || d.status === 'Hold') return
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

    // ============ SMART INSIGHTS (always 8 boxes) ============
    if (method === 'GET' && path === 'dashboard/insights') {
      const docs = (await col.find({}).toArray()).map(sanitize)
      const insights = []
      const thisMonth = monthKey(new Date())
      const nextMonthDate = new Date(); nextMonthDate.setMonth(nextMonthDate.getMonth() + 1)
      const nextMonth = monthKey(nextMonthDate)

      // 1. Renewals next 30 days
      const upcoming30 = docs.filter(d => {
        if (!d.renewalDate || d.status === 'Cancelled' || d.status === 'Hold') return false
        const diff = daysBetween(d.renewalDate); return diff >= 0 && diff <= 30
      })
      if (upcoming30.length > 0) {
        const total = upcoming30.reduce((s, d) => s + (Number(d.amount) || 0), 0)
        insights.push({ icon: 'calendar', tone: 'info', title: `${upcoming30.length} renewals in next 30 days`, detail: `Total liability ₹${total.toLocaleString('en-IN')}` })
      }

      // 2-3. AI credit warnings
      docs.filter(d => d.serviceType === 'AI Tool' && d.creditsAvailable && d.status !== 'Hold').forEach(d => {
        const pct = (Number(d.creditsRemaining) / Number(d.creditsAvailable)) * 100
        if (pct < 25 && pct > 0) {
          const remaining = Number(d.creditsRemaining)
          const consumed = Number(d.creditsAvailable) - remaining
          const daysSincePurchase = d.purchaseDate ? Math.max(1, daysBetween(d.purchaseDate) * -1) : 30
          const burnRate = consumed / Math.max(1, daysSincePurchase)
          const daysLeft = burnRate > 0 ? Math.round(remaining / burnRate) : null
          insights.push({ icon: 'zap', tone: 'warn', title: `${d.platformName} credits low (${Math.round(pct)}%)`, detail: daysLeft ? `Estimated exhaustion in ${daysLeft} days` : `${remaining} credits remaining` })
        } else if (pct === 0) {
          insights.push({ icon: 'alert', tone: 'danger', title: `${d.platformName} out of credits`, detail: 'Top-up recommended' })
        }
      })

      // 4. Spend forecast
      const spendForMonth = (mk) => docs.filter(d => d.renewalDate && monthKey(d.renewalDate) === mk && d.status !== 'Cancelled' && d.status !== 'Hold').reduce((s, d) => s + (Number(d.amount) || 0), 0)
      const thisMonthSpend = spendForMonth(thisMonth)
      const nextMonthSpend = spendForMonth(nextMonth)
      if (nextMonthSpend > 0 && nextMonthSpend !== thisMonthSpend) {
        const diff = Math.abs(nextMonthSpend - thisMonthSpend)
        const up = nextMonthSpend > thisMonthSpend
        insights.push({
          icon: 'trend', tone: up ? 'warn' : 'success',
          title: `Spend will ${up ? 'increase' : 'decrease'} by ₹${diff.toLocaleString('en-IN')} next month`,
          detail: `₹${thisMonthSpend.toLocaleString('en-IN')} → ₹${nextMonthSpend.toLocaleString('en-IN')}`,
        })
      }

      // 5. Manual pending
      const manualSubs = docs.filter(d => (d.renewalType === 'Manual' || !d.autoRenewal) && d.status !== 'Cancelled' && d.status !== 'Expired' && d.status !== 'Hold')
      const pending = manualSubs.filter(s => !s.paidMonths.includes(thisMonth))
      if (pending.length > 0) {
        insights.push({ icon: 'wallet', tone: 'warn', title: `${pending.length} manual payment${pending.length > 1 ? 's' : ''} pending this month`, detail: pending.slice(0, 3).map(s => s.platformName).join(', ') + (pending.length > 3 ? '…' : '') })
      }

      // 6. Unused tools recommendation (AI tools with >75% credits remaining and >14 days since purchase)
      const unused = docs.filter(d => {
        if (d.serviceType !== 'AI Tool' || !d.creditsAvailable) return false
        if (d.status === 'Cancelled' || d.status === 'Hold') return false
        const pct = (Number(d.creditsRemaining) / Number(d.creditsAvailable)) * 100
        const purchaseAge = d.purchaseDate ? Math.abs(daysBetween(d.purchaseDate)) : 0
        return pct > 75 && purchaseAge > 14
      })
      if (unused.length > 0) {
        const totalCost = unused.reduce((s, d) => s + monthlyAmount(d), 0)
        insights.push({
          icon: 'trash', tone: 'warn',
          title: `${unused.length} potentially unused tool${unused.length > 1 ? 's' : ''}`,
          detail: `Save ~₹${Math.round(totalCost).toLocaleString('en-IN')}/mo · ${unused.slice(0, 2).map(s => s.platformName).join(', ')}`,
        })
      }

      // 7. Duplicates
      const nameGroups = {}
      docs.forEach(d => { const k = (d.platformName || '').toLowerCase().trim().split(/[\s—-]/)[0]; if (k) nameGroups[k] = (nameGroups[k] || 0) + 1 })
      const dups = Object.entries(nameGroups).filter(([k, v]) => v > 1)
      if (dups.length > 0) {
        insights.push({ icon: 'alert', tone: 'warn', title: `${dups.length} potential duplicate subscription${dups.length > 1 ? 's' : ''}`, detail: dups.map(([k]) => k).slice(0, 3).join(', ') })
      }

      // 8. Expired needs attention
      const expired = docs.filter(d => d.status === 'Expired')
      if (expired.length > 0) {
        insights.push({ icon: 'alert', tone: 'danger', title: `${expired.length} subscription${expired.length > 1 ? 's' : ''} expired`, detail: expired.slice(0, 3).map(s => s.platformName).join(', ') })
      }

      // 9. Healthy auto-renew ratio
      const autoCount = docs.filter(d => d.autoRenewal && d.status !== 'Cancelled').length
      const total = docs.filter(d => d.status !== 'Cancelled').length
      if (total > 0) {
        const pct = Math.round((autoCount / total) * 100)
        insights.push({ icon: 'check', tone: 'success', title: `${pct}% subscriptions auto-renew`, detail: `${autoCount} of ${total} active subs are on auto-pay` })
      }

      // 10. On Hold count
      const heldSubs = docs.filter(d => d.status === 'Hold')
      if (heldSubs.length > 0) {
        insights.push({ icon: 'pause', tone: 'info', title: `${heldSubs.length} subscription${heldSubs.length > 1 ? 's' : ''} on hold`, detail: heldSubs.slice(0, 3).map(s => s.platformName).join(', ') })
      }

      // Pad to 8 if needed with defaults
      while (insights.length < 8) {
        insights.push({ icon: 'check', tone: 'success', title: 'All systems healthy', detail: 'No new issues detected' })
      }

      return json(insights.slice(0, 8))
    }

    // ============ PAYMENTS GRID ============
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
        const row = { id: s.id, platformName: s.platformName, amount: s.amount, paymentOwner: s.paymentOwner, paymentSourceId: s.paymentSourceId, status: s.status, months: {} }
        months.forEach(m => {
          const p = allPayments.find(p => p.subscriptionId === s.id && p.month === m.key)
          row.months[m.key] = p ? { status: p.status, paymentDate: p.paymentDate, transactionId: p.transactionId, id: p.id } : { status: 'Pending' }
        })
        return row
      })
      return json({ months, rows })
    }

    // ============ CALENDAR (renewals grouped by month) ============
    if (method === 'GET' && path === 'calendar') {
      const url = new URL(request.url)
      const monthsForward = Number(url.searchParams.get('months') || 12)
      const docs = (await col.find({}).toArray()).map(sanitize)
      const now = new Date()
      const groups = {}
      for (let i = 0; i < monthsForward; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
        groups[monthKey(d)] = { key: monthKey(d), monthName: `${['January','February','March','April','May','June','July','August','September','October','November','December'][d.getMonth()]} ${d.getFullYear()}`, items: [], total: 0 }
      }
      docs.forEach(d => {
        if (!d.renewalDate || d.status === 'Cancelled') return
        const k = monthKey(d.renewalDate)
        if (groups[k]) {
          groups[k].items.push({
            id: d.id, platformName: d.platformName, amount: d.amount,
            renewalDate: d.renewalDate, status: d.status, autoRenewal: d.autoRenewal,
            serviceType: d.serviceType, category: d.category,
          })
          groups[k].total += Number(d.amount) || 0
        }
      })
      Object.values(groups).forEach(g => g.items.sort((a, b) => new Date(a.renewalDate) - new Date(b.renewalDate)))
      return json(Object.values(groups))
    }

    // ============ SEED with spread renewals ============
    if (method === 'POST' && path === 'seed') {
      await col.deleteMany({})
      await sourcesCol.deleteMany({})
      await paymentsCol.deleteMany({})
      await notifsCol.deleteMany({})
      const today = new Date()
      const inDays = (n) => { const d = new Date(today); d.setDate(d.getDate() + n); return d.toISOString() }

      const sources = [
        { id: uuidv4(), name: 'HDFC Credit Card', type: 'Credit Card', bank: 'HDFC', last4: '4521', owner: 'Rohit', isDefault: true, expiryDate: '12/27', createdAt: new Date().toISOString() },
        { id: uuidv4(), name: 'Axis Card', type: 'Credit Card', bank: 'Axis Bank', last4: '8901', owner: 'Priya', isDefault: false, expiryDate: '08/26', createdAt: new Date().toISOString() },
        { id: uuidv4(), name: 'ICICI Account', type: 'Bank', bank: 'ICICI', last4: '2310', owner: 'Aman', isDefault: false, createdAt: new Date().toISOString() },
        { id: uuidv4(), name: 'UPI - Razorpay', type: 'UPI', bank: '', last4: '', owner: 'Rohit', isDefault: false, createdAt: new Date().toISOString() },
        { id: uuidv4(), name: 'Keshav Credit Card', type: 'Credit Card', bank: 'SBI', last4: '7723', owner: 'Keshav', isDefault: false, expiryDate: '05/28', createdAt: new Date().toISOString() },
      ]
      await sourcesCol.insertMany(sources)
      const [hdfc, axis, icici, upi, keshav] = sources

      // Spread across many months
      const demo = [
        // Current month renewals
        { platformName: 'ChatGPT Team', serviceType: 'AI Tool', category: 'Internal', amount: 1700, subscriptionType: 'Monthly', renewalDate: inDays(5), autoRenewal: false, paymentOwner: 'Rohit', paymentSourceId: hdfc.id, creditPurchases: [{ id: uuidv4(), type: 'initial', credits: 5000, amount: 1700, purchasedAt: inDays(-90) }, { id: uuidv4(), type: 'addon', credits: 2000, amount: 800, purchasedAt: inDays(-30) }, { id: uuidv4(), type: 'addon', credits: 500, amount: 250, purchasedAt: inDays(-10) }], creditsRemaining: 1700 },
        { platformName: 'Midjourney', serviceType: 'AI Tool', category: 'Agency', amount: 2400, subscriptionType: 'Monthly', renewalDate: inDays(2), autoRenewal: false, paymentOwner: 'Aman', paymentSourceId: icici.id, creditPurchases: [{ id: uuidv4(), type: 'initial', credits: 200, amount: 2400, purchasedAt: inDays(-28) }], creditsRemaining: 8 },
        { platformName: 'Perplexity Pro', serviceType: 'AI Tool', category: 'Internal', amount: 1650, subscriptionType: 'Monthly', renewalDate: inDays(-3), autoRenewal: false, paymentOwner: 'Aman', paymentSourceId: upi.id, creditPurchases: [{ id: uuidv4(), type: 'initial', credits: 600, amount: 1650, purchasedAt: inDays(-33) }], creditsRemaining: 0 },
        // Month +1
        { platformName: 'Claude Pro', serviceType: 'AI Tool', category: 'Internal', amount: 1800, subscriptionType: 'Monthly', renewalDate: inDays(12), autoRenewal: true, paymentOwner: 'Rohit', paymentSourceId: hdfc.id, creditPurchases: [{ id: uuidv4(), type: 'initial', credits: 200, amount: 1800, purchasedAt: inDays(-12) }], creditsRemaining: 145 },
        { platformName: 'Emergent.sh', serviceType: 'AI Tool', category: 'Agency', amount: 2500, subscriptionType: 'Monthly', renewalDate: inDays(14), autoRenewal: true, paymentOwner: 'Rohit', paymentSourceId: hdfc.id, creditPurchases: [{ id: uuidv4(), type: 'initial', credits: 1000, amount: 2500, purchasedAt: inDays(-16) }], creditsRemaining: 720 },
        { platformName: 'ElevenLabs', serviceType: 'AI Tool', category: 'Internal', amount: 950, subscriptionType: 'Monthly', renewalDate: inDays(18), autoRenewal: true, paymentOwner: 'Rohit', paymentSourceId: hdfc.id, creditPurchases: [{ id: uuidv4(), type: 'initial', credits: 30000, amount: 950, purchasedAt: inDays(-18) }], creditsRemaining: 26500 },
        { platformName: 'Cursor Pro', serviceType: 'AI Tool', category: 'Internal', amount: 1650, subscriptionType: 'Monthly', renewalDate: inDays(20), autoRenewal: true, paymentOwner: 'Priya', paymentSourceId: axis.id, creditPurchases: [{ id: uuidv4(), type: 'initial', credits: 500, amount: 1650, purchasedAt: inDays(-10) }], creditsRemaining: 380 },
        { platformName: 'Lovable Pro', serviceType: 'AI Tool', category: 'Agency', amount: 2000, subscriptionType: 'Monthly', renewalDate: inDays(22), autoRenewal: true, paymentOwner: 'Keshav', paymentSourceId: keshav.id, creditPurchases: [{ id: uuidv4(), type: 'initial', credits: 300, amount: 2000, purchasedAt: inDays(-8) }], creditsRemaining: 290 },
        { platformName: 'Notion Team', serviceType: 'Workspace', category: 'Agency', amount: 6000, subscriptionType: 'Yearly', renewalDate: inDays(28), autoRenewal: true, paymentOwner: 'Priya', paymentSourceId: axis.id },
        // Month +2
        { platformName: 'GoDaddy - acme.com', serviceType: 'Domain', category: 'Client', amount: 1199, subscriptionType: 'Yearly', renewalDate: inDays(38), autoRenewal: true, paymentOwner: 'Rohit', paymentSourceId: hdfc.id, clientName: 'Acme Corp' },
        { platformName: 'Bolt.new', serviceType: 'AI Tool', category: 'Agency', amount: 1500, subscriptionType: 'Monthly', renewalDate: inDays(42), autoRenewal: false, paymentOwner: 'Aman', paymentSourceId: upi.id, creditPurchases: [{ id: uuidv4(), type: 'initial', credits: 100, amount: 1500, purchasedAt: inDays(-2) }], creditsRemaining: 78 },
        { platformName: 'Vercel Pro', serviceType: 'Hosting', category: 'Agency', amount: 1700, subscriptionType: 'Monthly', renewalDate: inDays(48), autoRenewal: true, paymentOwner: 'Keshav', paymentSourceId: keshav.id },
        // Month +3
        { platformName: 'Google Workspace', serviceType: 'Workspace', category: 'Agency', amount: 24000, subscriptionType: 'Yearly', renewalDate: inDays(60), autoRenewal: true, paymentOwner: 'Rohit', paymentSourceId: hdfc.id },
        { platformName: 'Linear', serviceType: 'SaaS Tool', category: 'Agency', amount: 9600, subscriptionType: 'Yearly', renewalDate: inDays(64), autoRenewal: true, paymentOwner: 'Priya', paymentSourceId: axis.id },
        { platformName: 'GitHub Team', serviceType: 'SaaS Tool', category: 'Agency', amount: 4800, subscriptionType: 'Yearly', renewalDate: inDays(72), autoRenewal: true, paymentOwner: 'Keshav', paymentSourceId: keshav.id },
        // Month +4
        { platformName: 'Figma Org', serviceType: 'SaaS Tool', category: 'Agency', amount: 15000, subscriptionType: 'Yearly', renewalDate: inDays(80), autoRenewal: false, paymentOwner: 'Priya', paymentSourceId: axis.id },
        { platformName: 'Razorpay', serviceType: 'SaaS Tool', category: 'Agency', amount: 12000, subscriptionType: 'Yearly', renewalDate: inDays(85), autoRenewal: true, paymentOwner: 'Aman', paymentSourceId: icici.id },
        { platformName: 'AWS S3 Storage', serviceType: 'Hosting', category: 'Agency', amount: 8400, subscriptionType: 'Yearly', renewalDate: inDays(88), autoRenewal: true, paymentOwner: 'Rohit', paymentSourceId: hdfc.id },
        // Month +5
        { platformName: 'HubSpot CRM', serviceType: 'CRM', category: 'Agency', amount: 36000, subscriptionType: 'Yearly', renewalDate: inDays(95), autoRenewal: false, paymentOwner: 'Priya', paymentSourceId: axis.id },
        { platformName: 'Meta Ads Manager', serviceType: 'Marketing Tool', category: 'Client', amount: 25000, subscriptionType: 'Monthly', renewalDate: inDays(98), autoRenewal: false, paymentOwner: 'Aman', paymentSourceId: upi.id, clientName: 'Zenith Inc' },
        { platformName: 'Mailchimp', serviceType: 'Marketing Tool', category: 'Agency', amount: 14000, subscriptionType: 'Yearly', renewalDate: inDays(105), autoRenewal: true, paymentOwner: 'Priya', paymentSourceId: axis.id },
        // Month +6
        { platformName: 'Hostinger VPS', serviceType: 'VPS', category: 'Agency', amount: 18000, subscriptionType: 'Yearly', renewalDate: inDays(120), autoRenewal: true, paymentOwner: 'Rohit', paymentSourceId: hdfc.id },
        { platformName: 'Cloudflare Pro', serviceType: 'Hosting', category: 'Agency', amount: 20000, subscriptionType: 'Yearly', renewalDate: inDays(125), autoRenewal: true, paymentOwner: 'Keshav', paymentSourceId: keshav.id },
        // Month +7
        { platformName: 'Zoom Business', serviceType: 'Communication Tool', category: 'Agency', amount: 18000, subscriptionType: 'Yearly', renewalDate: inDays(140), autoRenewal: true, paymentOwner: 'Aman', paymentSourceId: icici.id },
        { platformName: 'Slack Pro', serviceType: 'Communication Tool', category: 'Agency', amount: 8200, subscriptionType: 'Yearly', renewalDate: inDays(150), autoRenewal: true, paymentOwner: 'Aman', paymentSourceId: icici.id },
        // Month +8
        { platformName: 'Adobe Creative Cloud', serviceType: 'SaaS Tool', category: 'Agency', amount: 32000, subscriptionType: 'Yearly', renewalDate: inDays(170), autoRenewal: true, paymentOwner: 'Priya', paymentSourceId: axis.id },
        { platformName: 'Canva Teams', serviceType: 'SaaS Tool', category: 'Agency', amount: 5400, subscriptionType: 'Yearly', renewalDate: inDays(180), autoRenewal: false, paymentOwner: 'Keshav', paymentSourceId: keshav.id, status: 'Hold' },
        // Month +9
        { platformName: 'Microsoft 365', serviceType: 'Workspace', category: 'Agency', amount: 21000, subscriptionType: 'Yearly', renewalDate: inDays(200), autoRenewal: true, paymentOwner: 'Rohit', paymentSourceId: hdfc.id },
        // Long-tail
        { platformName: 'Twilio API', serviceType: 'SaaS Tool', category: 'Client', amount: 6000, subscriptionType: 'Yearly', renewalDate: inDays(220), autoRenewal: false, paymentOwner: 'Aman', paymentSourceId: icici.id, clientName: 'Zenith Inc' },
        { platformName: 'SendGrid', serviceType: 'SaaS Tool', category: 'Client', amount: 4500, subscriptionType: 'Yearly', renewalDate: inDays(245), autoRenewal: true, paymentOwner: 'Aman', paymentSourceId: icici.id, clientName: 'Acme Corp' },
        { platformName: 'GoDaddy - zenith.io', serviceType: 'Domain', category: 'Client', amount: 999, subscriptionType: 'Yearly', renewalDate: inDays(260), autoRenewal: true, paymentOwner: 'Rohit', paymentSourceId: hdfc.id, clientName: 'Zenith Inc' },
      ]
      const now = new Date().toISOString()
      const docs = demo.map(d => ({
        id: uuidv4(), createdAt: now, updatedAt: now,
        purchaseDate: d.creditPurchases?.[0]?.purchasedAt || now, currency: 'INR', paymentMode: 'Credit Card',
        registeredEmail: 'finance@agency.com', username: 'agency_admin',
        adminAccess: '', notes: '', clientName: '', tags: [], creditPurchases: [], paidMonths: [],
        ...d,
        creditsAvailable: (d.creditPurchases || []).reduce((s, p) => s + (Number(p.credits) || 0), 0),
        renewalFrequency: d.subscriptionType,
        renewalType: d.autoRenewal ? 'Auto' : 'Manual',
        status: d.status || 'Active',
      }))
      await col.insertMany(docs)

      // Manual payment history
      const histPayments = []
      const monthOffset = (n) => { const d = new Date(); d.setMonth(d.getMonth() + n); return monthKey(d) }
      const setPaid = (platformName, monthsAgo) => {
        const sub = docs.find(d => d.platformName === platformName)
        if (!sub) return
        monthsAgo.forEach(m => {
          const mKey = monthOffset(m)
          histPayments.push({ id: uuidv4(), subscriptionId: sub.id, month: mKey, status: 'Paid', paymentDate: inDays(m * 30 + 5), transactionId: `TXN${Math.floor(Math.random()*1e8)}`, amount: sub.amount, paymentSourceId: sub.paymentSourceId, notes: '', createdAt: now })
          if (!sub.paidMonths) sub.paidMonths = []
          sub.paidMonths.push(mKey)
        })
        // persist paidMonths on sub
      }
      setPaid('ChatGPT Team', [-5, -4, -3, -1])
      setPaid('Midjourney', [-3, -2, -1])
      setPaid('Meta Ads Manager', [-4, -3, -2])
      setPaid('Figma Org', [-2, -1])
      setPaid('Bolt.new', [-1])
      if (histPayments.length) await paymentsCol.insertMany(histPayments)
      // Update paidMonths on subs
      const subUpdates = {}
      histPayments.forEach(p => { (subUpdates[p.subscriptionId] = subUpdates[p.subscriptionId] || []).push(p.month) })
      for (const [subId, months] of Object.entries(subUpdates)) {
        await col.updateOne({ id: subId }, { $set: { paidMonths: months } })
      }

      // Seed notifications
      const notifs = [
        { id: uuidv4(), type: 'renewal', tone: 'warn', title: 'Midjourney renews in 2 days', detail: '₹2,400 · Manual payment due', createdAt: inDays(-1), read: false },
        { id: uuidv4(), type: 'credit', tone: 'danger', title: 'Perplexity Pro out of credits', detail: 'Top up immediately', createdAt: inDays(-1), read: false },
        { id: uuidv4(), type: 'credit', tone: 'warn', title: 'ChatGPT Team credits at 23%', detail: 'Estimated 26 days remaining', createdAt: inDays(-2), read: false },
        { id: uuidv4(), type: 'payment', tone: 'success', title: 'Midjourney paid for May', detail: '₹2,400 via ICICI · TXN85213094', createdAt: inDays(-5), read: true },
        { id: uuidv4(), type: 'system', tone: 'info', title: '5 new subscriptions added', detail: 'Including Lovable Pro and Bolt.new', createdAt: inDays(-7), read: true },
      ]
      await notifsCol.insertMany(notifs)

      return json({ inserted: docs.length, sources: sources.length, payments: histPayments.length, notifications: notifs.length })
    }

    return json({ error: 'Not found', path, method }, 404)
  } catch (e) {
    console.error(e)
    return json({ error: e.message }, 500)
  }
}

export { handler as GET, handler as POST, handler as PUT, handler as DELETE, handler as PATCH }
