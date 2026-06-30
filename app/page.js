'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Progress } from '@/components/ui/progress'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'
import { useTheme } from 'next-themes'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import {
  LayoutDashboard, CreditCard, Calendar as CalendarIcon, Sparkles, Search,
  Plus, MoreHorizontal, Trash2, Pencil, RefreshCw, Moon, Sun, Download,
  TrendingUp, AlertTriangle, CheckCircle2, Clock, Zap, Wallet, Building2, Filter,
} from 'lucide-react'
import { motion } from 'framer-motion'

const CATEGORIES = ['Agency', 'Client', 'Internal']
const SERVICE_TYPES = ['Domain', 'Hosting', 'VPS', 'SaaS Tool', 'AI Tool', 'CRM', 'Marketing Tool', 'Workspace', 'Communication Tool', 'Others']
const SUB_TYPES = ['Monthly', 'Quarterly', 'Yearly']
const STATUSES = ['Active', 'Expiring Soon', 'Expired', 'Cancelled']
const PALETTE = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#ef4444', '#84cc16', '#f43f5e', '#0ea5e9']

const fmtINR = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const daysTo = (d) => {
  if (!d) return null
  const a = new Date(); a.setHours(0,0,0,0)
  const b = new Date(d); b.setHours(0,0,0,0)
  return Math.round((b - a) / 86400000)
}

const statusBadge = (s) => {
  const map = {
    'Active': 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30',
    'Expiring Soon': 'bg-amber-500/15 text-amber-500 border-amber-500/30',
    'Expired': 'bg-rose-500/15 text-rose-500 border-rose-500/30',
    'Cancelled': 'bg-zinc-500/15 text-zinc-500 border-zinc-500/30',
  }
  return map[s] || map['Active']
}

function KpiCard({ icon: Icon, label, value, sub, accent = 'from-indigo-500 to-purple-600' }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <Card className="relative overflow-hidden border-border/60 bg-card/60 backdrop-blur">
        <div className={`absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br ${accent} opacity-20 blur-2xl`} />
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
              <div className="mt-2 text-2xl font-bold tracking-tight">{value}</div>
              {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
            </div>
            <div className={`grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br ${accent} text-white shadow-lg`}>
              <Icon className="h-5 w-5" />
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

function SubscriptionForm({ initial, onSubmit, onCancel }) {
  const [form, setForm] = useState(initial || {
    platformName: '', category: 'Agency', serviceType: 'SaaS Tool',
    amount: '', currency: 'INR', subscriptionType: 'Monthly',
    renewalDate: '', purchaseDate: new Date().toISOString().slice(0, 10),
    autoRenewal: true, paymentMode: 'Credit Card', paymentOwner: '',
    creditsAvailable: '', creditsRemaining: '',
    username: '', registeredEmail: '', adminAccess: '', notes: '', clientName: '', status: 'Active',
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-1.5">
        <Label>Platform Name *</Label>
        <Input value={form.platformName} onChange={e => set('platformName', e.target.value)} placeholder="e.g., ChatGPT Plus" />
      </div>
      <div className="space-y-1.5">
        <Label>Category</Label>
        <Select value={form.category} onValueChange={v => set('category', v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Service Type</Label>
        <Select value={form.serviceType} onValueChange={v => set('serviceType', v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{SERVICE_TYPES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Subscription Type</Label>
        <Select value={form.subscriptionType} onValueChange={v => set('subscriptionType', v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{SUB_TYPES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Amount ({form.currency})</Label>
        <Input type="number" value={form.amount} onChange={e => set('amount', e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label>Currency</Label>
        <Select value={form.currency} onValueChange={v => set('currency', v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{['INR','USD','EUR','GBP'].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Purchase Date</Label>
        <Input type="date" value={form.purchaseDate?.slice(0,10) || ''} onChange={e => set('purchaseDate', e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label>Renewal Date *</Label>
        <Input type="date" value={form.renewalDate?.slice(0,10) || ''} onChange={e => set('renewalDate', e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label>Payment Mode</Label>
        <Input value={form.paymentMode} onChange={e => set('paymentMode', e.target.value)} placeholder="Credit Card / UPI" />
      </div>
      <div className="space-y-1.5">
        <Label>Payment Owner</Label>
        <Input value={form.paymentOwner} onChange={e => set('paymentOwner', e.target.value)} placeholder="Person/Department" />
      </div>
      {form.category === 'Client' && (
        <div className="space-y-1.5 md:col-span-2">
          <Label>Client Name</Label>
          <Input value={form.clientName} onChange={e => set('clientName', e.target.value)} />
        </div>
      )}
      {form.serviceType === 'AI Tool' && (
        <>
          <div className="space-y-1.5">
            <Label>Credits Available</Label>
            <Input type="number" value={form.creditsAvailable ?? ''} onChange={e => set('creditsAvailable', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Credits Remaining</Label>
            <Input type="number" value={form.creditsRemaining ?? ''} onChange={e => set('creditsRemaining', e.target.value)} />
          </div>
        </>
      )}
      <div className="space-y-1.5">
        <Label>Username</Label>
        <Input value={form.username} onChange={e => set('username', e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label>Registered Email</Label>
        <Input type="email" value={form.registeredEmail} onChange={e => set('registeredEmail', e.target.value)} />
      </div>
      <div className="flex items-center justify-between rounded-lg border border-border/60 p-3 md:col-span-2">
        <div>
          <div className="text-sm font-medium">Auto Renewal</div>
          <div className="text-xs text-muted-foreground">Toggle if this subscription renews automatically</div>
        </div>
        <Switch checked={!!form.autoRenewal} onCheckedChange={v => set('autoRenewal', v)} />
      </div>
      <div className="space-y-1.5 md:col-span-2">
        <Label>Notes</Label>
        <Textarea value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Any extra notes..." rows={3} />
      </div>
      <div className="flex justify-end gap-2 md:col-span-2">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={() => onSubmit(form)} disabled={!form.platformName || !form.renewalDate}>
          {initial?.id ? 'Save Changes' : 'Create Subscription'}
        </Button>
      </div>
    </div>
  )
}

function App() {
  const { theme, setTheme } = useTheme()
  const [tab, setTab] = useState('dashboard')
  const [subs, setSubs] = useState([])
  const [stats, setStats] = useState(null)
  const [upcoming, setUpcoming] = useState([])
  const [analytics, setAnalytics] = useState(null)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [fCategory, setFCategory] = useState('all')
  const [fService, setFService] = useState('all')
  const [fStatus, setFStatus] = useState('all')
  const [fAuto, setFAuto] = useState('all')
  const [showDialog, setShowDialog] = useState(false)
  const [editing, setEditing] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const [s, st, up, an] = await Promise.all([
        fetch('/api/subscriptions').then(r => r.json()),
        fetch('/api/dashboard/stats').then(r => r.json()),
        fetch('/api/dashboard/upcoming').then(r => r.json()),
        fetch('/api/dashboard/analytics').then(r => r.json()),
      ])
      setSubs(Array.isArray(s) ? s : [])
      setStats(st)
      setUpcoming(Array.isArray(up) ? up : [])
      setAnalytics(an)
    } catch (e) {
      toast.error('Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const seedDemo = async () => {
    setLoading(true)
    const r = await fetch('/api/seed', { method: 'POST' }).then(r => r.json())
    toast.success(`Loaded ${r.inserted} demo subscriptions`)
    await load()
  }

  const saveSub = async (data) => {
    const url = editing?.id ? `/api/subscriptions/${editing.id}` : '/api/subscriptions'
    const method = editing?.id ? 'PUT' : 'POST'
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
    if (r.ok) {
      toast.success(editing?.id ? 'Subscription updated' : 'Subscription created')
      setShowDialog(false); setEditing(null); load()
    } else toast.error('Save failed')
  }

  const deleteSub = async (id) => {
    if (!confirm('Delete this subscription?')) return
    await fetch(`/api/subscriptions/${id}`, { method: 'DELETE' })
    toast.success('Deleted'); load()
  }

  const filtered = useMemo(() => {
    return subs.filter(s => {
      if (search) {
        const q = search.toLowerCase()
        const hay = [s.platformName, s.username, s.registeredEmail, s.paymentOwner, s.clientName, s.notes].join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      if (fCategory !== 'all' && s.category !== fCategory) return false
      if (fService !== 'all' && s.serviceType !== fService) return false
      if (fStatus !== 'all' && s.status !== fStatus) return false
      if (fAuto !== 'all') {
        if (fAuto === 'yes' && !s.autoRenewal) return false
        if (fAuto === 'no' && s.autoRenewal) return false
      }
      return true
    })
  }, [subs, search, fCategory, fService, fStatus, fAuto])

  const aiTools = subs.filter(s => s.serviceType === 'AI Tool')

  const exportCSV = () => {
    const headers = ['Platform','Category','Service Type','Amount','Currency','Subscription Type','Renewal Date','Status','Auto Renewal','Payment Owner','Credits Remaining','Notes']
    const rows = filtered.map(s => [s.platformName, s.category, s.serviceType, s.amount, s.currency, s.subscriptionType, s.renewalDate?.slice(0,10) || '', s.status, s.autoRenewal ? 'Yes' : 'No', s.paymentOwner, s.creditsRemaining ?? '', (s.notes || '').replace(/[\n,]/g, ' ')])
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `subscriptions-${Date.now()}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  // build calendar matrix for the current month
  const calendar = useMemo(() => {
    const today = new Date()
    const y = today.getFullYear(), m = today.getMonth()
    const first = new Date(y, m, 1)
    const startDay = first.getDay()
    const lastDate = new Date(y, m + 1, 0).getDate()
    const cells = []
    for (let i = 0; i < startDay; i++) cells.push(null)
    for (let d = 1; d <= lastDate; d++) {
      const date = new Date(y, m, d)
      const items = subs.filter(s => s.renewalDate && new Date(s.renewalDate).toDateString() === date.toDateString())
      cells.push({ date, items })
    }
    return { y, m, cells, monthName: first.toLocaleString('default', { month: 'long', year: 'numeric' }) }
  }, [subs])

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between px-4 md:px-6">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/30">
              <Wallet className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="text-base font-bold tracking-tight">SubsHub</div>
              <div className="-mt-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">Agency Subscription Manager</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative hidden md:block">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search platform, owner, email..." className="w-72 pl-9" />
            </div>
            <Button variant="ghost" size="icon" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`mr-2 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </Button>
            <Button size="sm" onClick={() => { setEditing(null); setShowDialog(true) }} className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-500/30 hover:opacity-90">
              <Plus className="mr-1.5 h-4 w-4" /> Add Subscription
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-4 py-6 md:px-6">
        <Tabs value={tab} onValueChange={setTab} className="space-y-6">
          <TabsList className="grid w-full max-w-2xl grid-cols-4">
            <TabsTrigger value="dashboard"><LayoutDashboard className="mr-1.5 h-4 w-4" /> Dashboard</TabsTrigger>
            <TabsTrigger value="subscriptions"><CreditCard className="mr-1.5 h-4 w-4" /> Subscriptions</TabsTrigger>
            <TabsTrigger value="calendar"><CalendarIcon className="mr-1.5 h-4 w-4" /> Calendar</TabsTrigger>
            <TabsTrigger value="ai"><Sparkles className="mr-1.5 h-4 w-4" /> AI Credits</TabsTrigger>
          </TabsList>

          {/* DASHBOARD */}
          <TabsContent value="dashboard" className="space-y-6">
            {(!stats || stats.totalSubscriptions === 0) && (
              <Card className="border-dashed bg-gradient-to-br from-indigo-500/5 to-purple-600/5">
                <CardContent className="flex flex-col items-center justify-center gap-3 py-10 text-center">
                  <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg"><Sparkles className="h-6 w-6" /></div>
                  <div className="text-lg font-semibold">Welcome to SubsHub</div>
                  <div className="max-w-md text-sm text-muted-foreground">Get started by loading sample data to explore the dashboard, or add your first subscription.</div>
                  <div className="flex gap-2">
                    <Button onClick={seedDemo} className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white">Load Demo Data</Button>
                    <Button variant="outline" onClick={() => { setEditing(null); setShowDialog(true) }}><Plus className="mr-1.5 h-4 w-4" />Add Subscription</Button>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <KpiCard icon={CheckCircle2} label="Active Subscriptions" value={stats?.activeSubscriptions ?? 0} sub={`${stats?.totalSubscriptions ?? 0} total`} accent="from-emerald-500 to-teal-600" />
              <KpiCard icon={Wallet} label="Monthly Spend" value={fmtINR(stats?.monthlySpend)} sub={`Annual ~ ${fmtINR(stats?.annualSpend)}`} accent="from-indigo-500 to-purple-600" />
              <KpiCard icon={Clock} label="Upcoming Renewals" value={stats?.upcomingRenewals ?? 0} sub="Next 30 days" accent="from-amber-500 to-orange-600" />
              <KpiCard icon={Zap} label="AI Credits Left" value={(stats?.aiCreditsRemaining ?? 0).toLocaleString()} sub={`${stats?.autoRenewalCount ?? 0} auto-renew`} accent="from-pink-500 to-rose-600" />
            </div>

            {/* Upcoming Payments */}
            <Card className="border-border/60 bg-card/60 backdrop-blur">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Upcoming Payments</CardTitle>
                  <CardDescription>Plan your cash flow for the next 6 months</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
                  {upcoming.map((b, i) => (
                    <motion.div key={b.key} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                      className="rounded-xl border border-border/60 bg-gradient-to-br from-background to-muted/30 p-4">
                      <div className="text-xs uppercase tracking-wider text-muted-foreground">{b.month}</div>
                      <div className="mt-2 text-xl font-bold tracking-tight">{fmtINR(b.total)}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{b.items.length} payment{b.items.length !== 1 ? 's' : ''}</div>
                    </motion.div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-2">
              <Card className="border-border/60 bg-card/60 backdrop-blur">
                <CardHeader>
                  <CardTitle>Spend by Category</CardTitle>
                  <CardDescription>Agency vs Client vs Internal</CardDescription>
                </CardHeader>
                <CardContent className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={analytics?.byCategory || []} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={55} paddingAngle={2}>
                        {(analytics?.byCategory || []).map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v) => fmtINR(v)} contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="border-border/60 bg-card/60 backdrop-blur">
                <CardHeader>
                  <CardTitle>Spend by Service Type</CardTitle>
                  <CardDescription>Where your money goes</CardDescription>
                </CardHeader>
                <CardContent className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analytics?.byServiceType || []}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" height={70} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(v) => fmtINR(v)} contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
                      <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                        {(analytics?.byServiceType || []).map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            <Card className="border-border/60 bg-card/60 backdrop-blur">
              <CardHeader>
                <CardTitle>Payment Trend</CardTitle>
                <CardDescription>Renewal expense distribution across months</CardDescription>
              </CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={analytics?.trend || []}>
                    <defs>
                      <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.8} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v) => fmtINR(v)} contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
                    <Line type="monotone" dataKey="amount" stroke="#6366f1" strokeWidth={3} dot={{ fill: '#8b5cf6', r: 4 }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          {/* SUBSCRIPTIONS */}
          <TabsContent value="subscriptions" className="space-y-4">
            <Card className="border-border/60">
              <CardContent className="flex flex-wrap items-center gap-2 p-4">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <Select value={fCategory} onValueChange={setFCategory}>
                  <SelectTrigger className="w-36"><SelectValue placeholder="Category" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={fService} onValueChange={setFService}>
                  <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Service Types</SelectItem>
                    {SERVICE_TYPES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={fStatus} onValueChange={setFStatus}>
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    {STATUSES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={fAuto} onValueChange={setFAuto}>
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Auto-renew: All</SelectItem>
                    <SelectItem value="yes">Auto-renew: Yes</SelectItem>
                    <SelectItem value="no">Auto-renew: No</SelectItem>
                  </SelectContent>
                </Select>
                <div className="relative ml-auto">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." className="w-56 pl-9" />
                </div>
                <Button variant="outline" size="sm" onClick={exportCSV}><Download className="mr-1.5 h-3.5 w-3.5" /> Export CSV</Button>
              </CardContent>
            </Card>

            <Card className="overflow-hidden border-border/60">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead>Platform</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Renewal</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Auto</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 && (
                    <TableRow><TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">No subscriptions found</TableCell></TableRow>
                  )}
                  {filtered.map(s => {
                    const dt = daysTo(s.renewalDate)
                    return (
                      <TableRow key={s.id} className="hover:bg-muted/30">
                        <TableCell>
                          <div className="font-medium">{s.platformName}</div>
                          <div className="text-xs text-muted-foreground">{s.serviceType}</div>
                        </TableCell>
                        <TableCell><Badge variant="outline" className="font-normal">{s.category}</Badge></TableCell>
                        <TableCell className="text-sm">{s.subscriptionType}</TableCell>
                        <TableCell className="font-medium">{fmtINR(s.amount)}</TableCell>
                        <TableCell>
                          <div className="text-sm">{fmtDate(s.renewalDate)}</div>
                          {dt !== null && (
                            <div className={`text-xs ${dt < 0 ? 'text-rose-500' : dt <= 7 ? 'text-amber-500' : 'text-muted-foreground'}`}>
                              {dt < 0 ? `${Math.abs(dt)}d ago` : dt === 0 ? 'Today' : `in ${dt}d`}
                            </div>
                          )}
                        </TableCell>
                        <TableCell><Badge variant="outline" className={statusBadge(s.status)}>{s.status}</Badge></TableCell>
                        <TableCell>{s.autoRenewal ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <span className="text-xs text-muted-foreground">No</span>}</TableCell>
                        <TableCell className="text-sm">{s.paymentOwner || '—'}</TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => { setEditing(s); setShowDialog(true) }}><Pencil className="mr-2 h-3.5 w-3.5" /> Edit</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => deleteSub(s.id)} className="text-rose-500"><Trash2 className="mr-2 h-3.5 w-3.5" /> Delete</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          {/* CALENDAR */}
          <TabsContent value="calendar" className="space-y-4">
            <Card className="border-border/60">
              <CardHeader>
                <CardTitle>{calendar.monthName} — Renewal Calendar</CardTitle>
                <CardDescription>All upcoming renewals at a glance</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-7 gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                  {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => <div key={d} className="py-1 text-center">{d}</div>)}
                </div>
                <div className="mt-2 grid grid-cols-7 gap-2">
                  {calendar.cells.map((c, i) => (
                    <div key={i} className={`min-h-[88px] rounded-lg border p-2 ${c ? 'border-border/60 bg-card/40' : 'border-transparent'}`}>
                      {c && (
                        <>
                          <div className="text-xs font-semibold">{c.date.getDate()}</div>
                          <div className="mt-1 space-y-1">
                            {c.items.slice(0, 3).map(it => (
                              <div key={it.id} className="truncate rounded bg-indigo-500/15 px-1.5 py-0.5 text-[10px] text-indigo-400" title={it.platformName}>
                                {it.platformName}
                              </div>
                            ))}
                            {c.items.length > 3 && <div className="text-[10px] text-muted-foreground">+{c.items.length - 3} more</div>}
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* AI CREDITS */}
          <TabsContent value="ai" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {aiTools.length === 0 && (
                <Card className="col-span-full border-dashed"><CardContent className="py-10 text-center text-sm text-muted-foreground">No AI tools tracked yet. Add an AI Tool subscription to monitor credits.</CardContent></Card>
              )}
              {aiTools.map(t => {
                const pct = t.creditsAvailable ? Math.min(100, Math.round((Number(t.creditsRemaining) / Number(t.creditsAvailable)) * 100)) : 0
                const low = pct < 20
                return (
                  <Card key={t.id} className="relative overflow-hidden border-border/60">
                    {low && <div className="absolute right-3 top-3"><Badge variant="outline" className="bg-rose-500/15 text-rose-500 border-rose-500/30"><AlertTriangle className="mr-1 h-3 w-3" /> Low</Badge></div>}
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-purple-500" /> {t.platformName}</CardTitle>
                      <CardDescription>{t.subscriptionType} · {fmtINR(t.amount)} · Renews {fmtDate(t.renewalDate)}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div>
                        <div className="flex items-baseline justify-between text-sm">
                          <span className="text-muted-foreground">Credits</span>
                          <span className="font-medium">{Number(t.creditsRemaining || 0).toLocaleString()} / {Number(t.creditsAvailable || 0).toLocaleString()}</span>
                        </div>
                        <Progress value={pct} className="mt-2 h-2" />
                        <div className={`mt-1 text-xs ${low ? 'text-rose-500' : 'text-muted-foreground'}`}>{pct}% remaining</div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="flex-1" onClick={() => { setEditing(t); setShowDialog(true) }}>Update Credits</Button>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </TabsContent>
        </Tabs>
      </main>

      {/* Add/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={(o) => { setShowDialog(o); if (!o) setEditing(null) }}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.id ? 'Edit Subscription' : 'Add New Subscription'}</DialogTitle>
            <DialogDescription>Fill in the details to track this subscription</DialogDescription>
          </DialogHeader>
          <SubscriptionForm initial={editing} onSubmit={saveSub} onCancel={() => { setShowDialog(false); setEditing(null) }} />
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default App
