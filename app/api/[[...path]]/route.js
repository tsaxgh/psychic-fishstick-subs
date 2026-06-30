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

function json(data, status = 200) {
  return NextResponse.json(data, { status })
}

// --- helpers ---
function daysBetween(date) {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return Math.round((d - now) / (1000 * 60 * 60 * 24))
}

function computeStatus(sub) {
  if (sub.status === 'Cancelled') return 'Cancelled'
  if (!sub.renewalDate) return sub.status || 'Active'
  const diff = daysBetween(sub.renewalDate)
  if (diff < 0) return 'Expired'
  if (diff <= 15) return 'Expiring Soon'
  return 'Active'
}

function sanitize(sub) {
  const { _id, ...rest } = sub
  return { ...rest, status: computeStatus(rest) }
}

function monthKey(d) {
  const dt = new Date(d)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
}

async function handler(request, ctx) {
  const params = await ctx.params
  const path = (params?.path || []).join('/')
  const method = request.method
  const db = await getDb()
  const col = db.collection('subscriptions')

  try {
    // GET /api/subscriptions
    if (method === 'GET' && path === 'subscriptions') {
      const docs = await col.find({}).sort({ renewalDate: 1 }).toArray()
      return json(docs.map(sanitize))
    }

    // POST /api/subscriptions
    if (method === 'POST' && path === 'subscriptions') {
      const body = await request.json()
      const now = new Date().toISOString()
      const doc = {
        id: uuidv4(),
        createdAt: now,
        updatedAt: now,
        purchaseDate: body.purchaseDate || now,
        category: body.category || 'Internal',
        platformName: body.platformName || 'Untitled',
        serviceType: body.serviceType || 'SaaS Tool',
        creditsAvailable: body.creditsAvailable ?? null,
        creditsRemaining: body.creditsRemaining ?? null,
        subscriptionType: body.subscriptionType || 'Monthly',
        amount: Number(body.amount || 0),
        currency: body.currency || 'INR',
        paymentMode: body.paymentMode || '',
        paymentOwner: body.paymentOwner || '',
        autoRenewal: !!body.autoRenewal,
        renewalDate: body.renewalDate || null,
        renewalFrequency: body.renewalFrequency || body.subscriptionType || 'Monthly',
        status: body.status || 'Active',
        username: body.username || '',
        registeredEmail: body.registeredEmail || '',
        adminAccess: body.adminAccess || '',
        notes: body.notes || '',
        clientName: body.clientName || '',
      }
      await col.insertOne(doc)
      return json(sanitize(doc), 201)
    }

    // PUT /api/subscriptions/:id
    if (method === 'PUT' && path.startsWith('subscriptions/')) {
      const id = path.split('/')[1]
      const body = await request.json()
      delete body._id
      delete body.id
      body.updatedAt = new Date().toISOString()
      if (body.amount !== undefined) body.amount = Number(body.amount)
      const r = await col.findOneAndUpdate(
        { id },
        { $set: body },
        { returnDocument: 'after' }
      )
      const updated = r?.value || r
      if (!updated) return json({ error: 'Not found' }, 404)
      return json(sanitize(updated))
    }

    // DELETE /api/subscriptions/:id
    if (method === 'DELETE' && path.startsWith('subscriptions/')) {
      const id = path.split('/')[1]
      await col.deleteOne({ id })
      return json({ ok: true })
    }

    // GET /api/dashboard/stats
    if (method === 'GET' && path === 'dashboard/stats') {
      const docs = (await col.find({}).toArray()).map(sanitize)
      const active = docs.filter(d => d.status === 'Active' || d.status === 'Expiring Soon').length
      const expired = docs.filter(d => d.status === 'Expired').length
      const expiringSoon = docs.filter(d => d.status === 'Expiring Soon').length
      const autoRenewalCount = docs.filter(d => d.autoRenewal).length
      const aiCredits = docs.filter(d => d.serviceType === 'AI Tool').reduce((s, d) => s + (Number(d.creditsRemaining) || 0), 0)

      // normalize monthly amount
      const monthly = (d) => {
        const a = Number(d.amount) || 0
        const t = d.subscriptionType || d.renewalFrequency
        if (t === 'Yearly') return a / 12
        if (t === 'Quarterly') return a / 3
        return a
      }
      const monthlySpend = docs.filter(d => d.status !== 'Cancelled' && d.status !== 'Expired').reduce((s, d) => s + monthly(d), 0)
      const annualSpend = monthlySpend * 12

      // upcoming renewals (next 30 days)
      const upcoming = docs.filter(d => {
        if (!d.renewalDate) return false
        const diff = daysBetween(d.renewalDate)
        return diff >= 0 && diff <= 30
      }).length

      return json({
        activeSubscriptions: active,
        monthlySpend: Math.round(monthlySpend),
        annualSpend: Math.round(annualSpend),
        upcomingRenewals: upcoming,
        expired,
        expiringSoon,
        aiCreditsRemaining: aiCredits,
        autoRenewalCount,
        totalSubscriptions: docs.length,
      })
    }

    // GET /api/dashboard/upcoming
    if (method === 'GET' && path === 'dashboard/upcoming') {
      const docs = (await col.find({}).toArray()).map(sanitize)
      // group by month for next 6 months
      const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
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
      const trend = {} // monthKey -> total

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
      for (let i = -2; i <= 5; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
        const k = monthKey(d)
        trendArr.push({
          month: d.toLocaleString('default', { month: 'short' }),
          amount: trend[k] || 0,
        })
      }

      return json({
        byCategory: Object.entries(byCategory).map(([name, value]) => ({ name, value })),
        byServiceType: Object.entries(byServiceType).map(([name, value]) => ({ name, value })),
        trend: trendArr,
      })
    }

    // POST /api/seed - quick demo data
    if (method === 'POST' && path === 'seed') {
      await col.deleteMany({})
      const today = new Date()
      const inDays = (n) => { const d = new Date(today); d.setDate(d.getDate() + n); return d.toISOString() }
      const demo = [
        { platformName: 'ChatGPT Plus', serviceType: 'AI Tool', category: 'Internal', amount: 1700, subscriptionType: 'Monthly', renewalDate: inDays(5), creditsAvailable: 100, creditsRemaining: 32, autoRenewal: true, paymentOwner: 'Rohit', paymentMode: 'Credit Card', currency: 'INR', registeredEmail: 'team@agency.com', username: 'agency_ai' },
        { platformName: 'Claude Pro', serviceType: 'AI Tool', category: 'Internal', amount: 1800, subscriptionType: 'Monthly', renewalDate: inDays(12), creditsAvailable: 200, creditsRemaining: 145, autoRenewal: true, paymentOwner: 'Rohit', paymentMode: 'Credit Card', currency: 'INR' },
        { platformName: 'Cursor Pro', serviceType: 'AI Tool', category: 'Internal', amount: 1650, subscriptionType: 'Monthly', renewalDate: inDays(20), creditsAvailable: 500, creditsRemaining: 380, autoRenewal: true, paymentOwner: 'Priya' },
        { platformName: 'Midjourney', serviceType: 'AI Tool', category: 'Agency', amount: 2400, subscriptionType: 'Monthly', renewalDate: inDays(2), creditsAvailable: 200, creditsRemaining: 8, autoRenewal: false, paymentOwner: 'Aman' },
        { platformName: 'GoDaddy - example.com', serviceType: 'Domain', category: 'Client', amount: 1199, subscriptionType: 'Yearly', renewalDate: inDays(45), autoRenewal: true, paymentOwner: 'Rohit', clientName: 'Acme Corp' },
        { platformName: 'Hostinger VPS', serviceType: 'VPS', category: 'Agency', amount: 18000, subscriptionType: 'Yearly', renewalDate: inDays(120), autoRenewal: true, paymentOwner: 'Rohit' },
        { platformName: 'Figma Org', serviceType: 'SaaS Tool', category: 'Agency', amount: 15000, subscriptionType: 'Yearly', renewalDate: inDays(80), autoRenewal: false, paymentOwner: 'Priya' },
        { platformName: 'Notion Team', serviceType: 'Workspace', category: 'Agency', amount: 6000, subscriptionType: 'Yearly', renewalDate: inDays(28), autoRenewal: true, paymentOwner: 'Priya' },
        { platformName: 'Slack Pro', serviceType: 'Communication Tool', category: 'Agency', amount: 8200, subscriptionType: 'Yearly', renewalDate: inDays(150), autoRenewal: true, paymentOwner: 'Aman' },
        { platformName: 'Google Workspace', serviceType: 'Workspace', category: 'Agency', amount: 24000, subscriptionType: 'Yearly', renewalDate: inDays(60), autoRenewal: true, paymentOwner: 'Rohit' },
        { platformName: 'HubSpot CRM', serviceType: 'CRM', category: 'Agency', amount: 36000, subscriptionType: 'Yearly', renewalDate: inDays(90), autoRenewal: false, paymentOwner: 'Priya' },
        { platformName: 'Meta Ads Manager', serviceType: 'Marketing Tool', category: 'Client', amount: 25000, subscriptionType: 'Monthly', renewalDate: inDays(7), autoRenewal: false, paymentOwner: 'Aman', clientName: 'Zenith Inc' },
        { platformName: 'ElevenLabs', serviceType: 'AI Tool', category: 'Internal', amount: 950, subscriptionType: 'Monthly', renewalDate: inDays(18), creditsAvailable: 30000, creditsRemaining: 22000, autoRenewal: true, paymentOwner: 'Rohit' },
        { platformName: 'Perplexity Pro', serviceType: 'AI Tool', category: 'Internal', amount: 1650, subscriptionType: 'Monthly', renewalDate: inDays(-3), creditsAvailable: 600, creditsRemaining: 0, autoRenewal: false, paymentOwner: 'Aman' },
        { platformName: 'Emergent.sh', serviceType: 'AI Tool', category: 'Agency', amount: 2500, subscriptionType: 'Monthly', renewalDate: inDays(14), creditsAvailable: 1000, creditsRemaining: 720, autoRenewal: true, paymentOwner: 'Rohit' },
      ]
      const now = new Date().toISOString()
      const docs = demo.map(d => ({
        id: uuidv4(), createdAt: now, updatedAt: now,
        purchaseDate: now, currency: 'INR', paymentMode: 'Credit Card',
        registeredEmail: 'finance@agency.com', username: 'agency_admin',
        adminAccess: '', notes: '', clientName: '',
        ...d,
        renewalFrequency: d.subscriptionType,
        status: 'Active',
      }))
      await col.insertMany(docs)
      return json({ inserted: docs.length })
    }

    return json({ error: 'Not found', path, method }, 404)
  } catch (e) {
    console.error(e)
    return json({ error: e.message }, 500)
  }
}

export { handler as GET, handler as POST, handler as PUT, handler as DELETE, handler as PATCH }
