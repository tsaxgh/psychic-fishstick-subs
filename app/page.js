'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Progress } from '@/components/ui/progress'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { useTheme } from 'next-themes'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Area, AreaChart,
} from 'recharts'
import {
  LayoutDashboard, CreditCard, Calendar as CalendarIcon, Sparkles, Search,
  Plus, MoreHorizontal, Trash2, Pencil, RefreshCw, Moon, Sun, Download,
  TrendingUp, AlertTriangle, CheckCircle2, Clock, Zap, Wallet, Filter,
  Lightbulb, Receipt, Banknote, X, ArrowUpRight, BarChart3,
  Activity, ShieldCheck, Layers, Bell, ChevronLeft, ChevronRight, PauseCircle,
  Trash, Inbox, Tag, ChevronDown,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

const CATEGORIES = ['Agency', 'Client', 'Internal']
const SERVICE_TYPES = ['Domain', 'Hosting', 'VPS', 'SaaS Tool', 'AI Tool', 'CRM', 'Marketing Tool', 'Workspace', 'Communication Tool', 'Others']
const SUB_TYPES = ['Monthly', 'Quarterly', 'Yearly']
const STATUSES = ['Active', 'Expiring Soon', 'Expired', 'Hold', 'Cancelled']
const SOURCE_TYPES = ['Credit Card', 'Debit Card', 'Bank', 'UPI', 'Wallet', 'Cash']
const PALETTE = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#ef4444', '#84cc16', '#f43f5e', '#0ea5e9']

const fmtINR = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const fmtRel = (d) => {
  if (!d) return ''
  const diff = (Date.now() - new Date(d).getTime()) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`
  return `${Math.floor(diff/86400)}d ago`
}
const daysTo = (d) => {
  if (!d) return null
  const a = new Date(); a.setHours(0,0,0,0)
  const b = new Date(d); b.setHours(0,0,0,0)
  return Math.round((b - a) / 86400000)
}
const statusBadge = (s) => ({
  'Active': 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30',
  'Expiring Soon': 'bg-amber-500/15 text-amber-500 border-amber-500/30',
  'Expired': 'bg-rose-500/15 text-rose-500 border-rose-500/30',
  'Hold': 'bg-sky-500/15 text-sky-500 border-sky-500/30',
  'Cancelled': 'bg-zinc-500/15 text-zinc-500 border-zinc-500/30',
}[s] || 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30')

const PRESET_LABELS = {
  all: 'All Subscriptions', active: 'Active Subscriptions', renewals30: 'Renewing in 30 Days',
  manualPending: 'Manual Payments Pending', aiOnly: 'AI Tools', autoOnly: 'Auto-Renewing',
  expired: 'Expired Subscriptions', held: 'On Hold', expensive: 'Top Expensive',
}

// ---------- KPI (clickable) ----------
function Kpi({ icon: Icon, label, value, sub, accent = 'from-indigo-500 to-purple-600', onClick }) {
  return (
    <motion.div whileHover={{ y: -3, scale: 1.01 }} transition={{ duration: 0.15 }}>
      <Card onClick={onClick} className={`group relative overflow-hidden border-border/60 bg-card/60 backdrop-blur transition-all hover:border-indigo-500/50 hover:shadow-xl hover:shadow-indigo-500/10 ${onClick ? 'cursor-pointer' : ''}`}>
        <div className={`absolute -right-8 -top-8 h-28 w-28 rounded-full bg-gradient-to-br ${accent} opacity-20 blur-2xl transition-opacity duration-300 group-hover:opacity-40`} />
        <CardContent className="relative p-5">
          <div className="flex items-start justify-between">
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
              <div className="mt-2 truncate text-2xl font-bold tracking-tight">{value}</div>
              {sub && <div className="mt-1 truncate text-xs text-muted-foreground">{sub}</div>}
            </div>
            <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br ${accent} text-white shadow-md transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3`}>
              <Icon className="h-4 w-4" />
            </div>
          </div>
          {onClick && <div className="absolute bottom-2 right-3 text-[10px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">View details →</div>}
        </CardContent>
      </Card>
    </motion.div>
  )
}

// ---------- Sidebar ----------
const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'subscriptions', label: 'Subscriptions', icon: CreditCard },
  { id: 'payments', label: 'Payments', icon: Receipt },
  { id: 'sources', label: 'Payment Sources', icon: Banknote },
  { id: 'calendar', label: 'Calendar', icon: CalendarIcon },
  { id: 'ai', label: 'AI Credits', icon: Sparkles },
]

function Sidebar({ active, onChange, stats }) {
  return (
    <aside className="hidden w-60 shrink-0 border-r border-border/60 bg-card/40 backdrop-blur md:flex md:flex-col">
      <div className="flex h-16 items-center gap-3 border-b border-border/60 px-5">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/30 transition-transform hover:scale-110">
          <Wallet className="h-5 w-5 text-white" />
        </div>
        <div>
          <div className="text-base font-bold tracking-tight">SubsHub</div>
          <div className="-mt-0.5 text-[9px] uppercase tracking-[0.15em] text-muted-foreground">Intelligence Platform</div>
        </div>
      </div>
      <nav className="flex-1 space-y-1 p-3">
        {NAV.map(n => {
          const isActive = active === n.id
          return (
            <button key={n.id} onClick={() => onChange(n.id)}
              className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all ${isActive ? 'bg-gradient-to-r from-indigo-500/20 to-purple-600/10 text-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground hover:translate-x-0.5'}`}>
              <n.icon className={`h-4 w-4 transition-colors ${isActive ? 'text-indigo-400' : ''}`} />
              <span className="flex-1 text-left font-medium">{n.label}</span>
              {n.id === 'payments' && stats?.manualPending > 0 && (
                <Badge variant="outline" className="h-5 border-amber-500/30 bg-amber-500/15 px-1.5 text-[10px] text-amber-500">{stats.manualPending}</Badge>
              )}
            </button>
          )
        })}
      </nav>
      <div className="border-t border-border/60 p-4">
        <div className="rounded-lg bg-gradient-to-br from-indigo-500/10 to-purple-600/10 p-3">
          <div className="flex items-center gap-2 text-xs font-medium">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
            All systems operational
          </div>
          <div className="mt-1 text-[10px] text-muted-foreground">Last sync just now</div>
        </div>
      </div>
    </aside>
  )
}

// ---------- Subscription Form ----------
function SubscriptionForm({ initial, sources, onSubmit, onCancel }) {
  const [form, setForm] = useState(initial || {
    platformName: '', category: 'Agency', serviceType: 'SaaS Tool',
    amount: '', currency: 'INR', subscriptionType: 'Monthly',
    renewalDate: '', purchaseDate: new Date().toISOString().slice(0, 10),
    autoRenewal: true, paymentMode: 'Credit Card', paymentOwner: '',
    paymentSourceId: null, creditsAvailable: '', creditsRemaining: '',
    username: '', registeredEmail: '', adminAccess: '', notes: '', clientName: '', status: 'Active',
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-1.5"><Label>Platform Name *</Label><Input value={form.platformName} onChange={e => set('platformName', e.target.value)} /></div>
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
      <div className="space-y-1.5"><Label>Amount ({form.currency})</Label><Input type="number" value={form.amount} onChange={e => set('amount', e.target.value)} /></div>
      <div className="space-y-1.5">
        <Label>Currency</Label>
        <Select value={form.currency} onValueChange={v => set('currency', v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{['INR','USD','EUR','GBP'].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5"><Label>Purchase Date</Label><Input type="date" value={form.purchaseDate?.slice(0,10) || ''} onChange={e => set('purchaseDate', e.target.value)} /></div>
      <div className="space-y-1.5"><Label>Renewal Date *</Label><Input type="date" value={form.renewalDate?.slice(0,10) || ''} onChange={e => set('renewalDate', e.target.value)} /></div>
      <div className="space-y-1.5">
        <Label>Payment Source</Label>
        <Select value={form.paymentSourceId || 'none'} onValueChange={v => set('paymentSourceId', v === 'none' ? null : v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">— None —</SelectItem>
            {sources.map(s => <SelectItem key={s.id} value={s.id}>{s.name}{s.last4 ? ` ••${s.last4}` : ''}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5"><Label>Payment Owner</Label><Input value={form.paymentOwner} onChange={e => set('paymentOwner', e.target.value)} /></div>
      <div className="space-y-1.5">
        <Label>Status</Label>
        <Select value={form.status} onValueChange={v => set('status', v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {form.category === 'Client' && (
        <div className="space-y-1.5"><Label>Client Name</Label><Input value={form.clientName} onChange={e => set('clientName', e.target.value)} /></div>
      )}
      {form.serviceType === 'AI Tool' && !initial?.id && (
        <>
          <div className="space-y-1.5"><Label>Initial Credits</Label><Input type="number" value={form.creditsAvailable ?? ''} onChange={e => set('creditsAvailable', e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Credits Remaining</Label><Input type="number" value={form.creditsRemaining ?? ''} onChange={e => set('creditsRemaining', e.target.value)} /></div>
        </>
      )}
      <div className="space-y-1.5"><Label>Username</Label><Input value={form.username} onChange={e => set('username', e.target.value)} /></div>
      <div className="space-y-1.5"><Label>Registered Email</Label><Input type="email" value={form.registeredEmail} onChange={e => set('registeredEmail', e.target.value)} /></div>
      <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 p-3 md:col-span-2">
        <div>
          <div className="text-sm font-medium">Auto Renewal</div>
          <div className="text-xs text-muted-foreground">Off = Manual payment required each cycle</div>
        </div>
        <Switch checked={!!form.autoRenewal} onCheckedChange={v => set('autoRenewal', v)} />
      </div>
      <div className="space-y-1.5 md:col-span-2"><Label>Notes</Label><Textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} /></div>
      <div className="flex justify-end gap-2 md:col-span-2">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={() => onSubmit(form)} disabled={!form.platformName || !form.renewalDate} className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white hover:opacity-90">
          {initial?.id ? 'Save Changes' : 'Create'}
        </Button>
      </div>
    </div>
  )
}

function SourceForm({ initial, onSubmit, onCancel }) {
  const [f, setF] = useState(initial || { name: '', type: 'Credit Card', bank: '', last4: '', owner: '', isDefault: false, expiryDate: '', notes: '' })
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-1.5"><Label>Name *</Label><Input value={f.name} onChange={e => set('name', e.target.value)} /></div>
      <div className="space-y-1.5">
        <Label>Type</Label>
        <Select value={f.type} onValueChange={v => set('type', v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{SOURCE_TYPES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5"><Label>Bank</Label><Input value={f.bank} onChange={e => set('bank', e.target.value)} /></div>
      <div className="space-y-1.5"><Label>Last 4 Digits</Label><Input maxLength={4} value={f.last4} onChange={e => set('last4', e.target.value)} /></div>
      <div className="space-y-1.5"><Label>Owner</Label><Input value={f.owner} onChange={e => set('owner', e.target.value)} /></div>
      <div className="space-y-1.5"><Label>Expiry (MM/YY)</Label><Input value={f.expiryDate} onChange={e => set('expiryDate', e.target.value)} /></div>
      <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 p-3 md:col-span-2">
        <div className="text-sm font-medium">Default payment method</div>
        <Switch checked={!!f.isDefault} onCheckedChange={v => set('isDefault', v)} />
      </div>
      <div className="flex justify-end gap-2 md:col-span-2">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={() => onSubmit(f)} disabled={!f.name} className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white">{initial?.id ? 'Save' : 'Create Source'}</Button>
      </div>
    </div>
  )
}

function AddonForm({ onSubmit, onCancel }) {
  const [f, setF] = useState({ type: 'addon', credits: '', amount: '', notes: '', purchasedAt: new Date().toISOString().slice(0, 10) })
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-1.5"><Label>Credits to add *</Label><Input type="number" value={f.credits} onChange={e => setF({ ...f, credits: e.target.value })} /></div>
      <div className="space-y-1.5"><Label>Amount paid</Label><Input type="number" value={f.amount} onChange={e => setF({ ...f, amount: e.target.value })} /></div>
      <div className="space-y-1.5"><Label>Purchase Date</Label><Input type="date" value={f.purchasedAt} onChange={e => setF({ ...f, purchasedAt: e.target.value })} /></div>
      <div className="space-y-1.5"><Label>Notes</Label><Input value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} /></div>
      <div className="flex justify-end gap-2 md:col-span-2">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={() => onSubmit(f)} disabled={!f.credits} className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white">Add Credits</Button>
      </div>
    </div>
  )
}

function MarkPaymentForm({ sub, month, sources, onSubmit, onCancel }) {
  const [f, setF] = useState({ transactionId: '', amount: sub?.amount || 0, paymentDate: new Date().toISOString().slice(0, 10), paymentSourceId: sub?.paymentSourceId || null, notes: '' })
  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-muted/30 p-3 text-sm">
        <div className="font-medium">{sub?.platformName}</div>
        <div className="text-xs text-muted-foreground">Month: {month}</div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5"><Label>Transaction ID</Label><Input value={f.transactionId} onChange={e => setF({ ...f, transactionId: e.target.value })} placeholder="TXN12345" /></div>
        <div className="space-y-1.5"><Label>Amount Paid</Label><Input type="number" value={f.amount} onChange={e => setF({ ...f, amount: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>Payment Date</Label><Input type="date" value={f.paymentDate} onChange={e => setF({ ...f, paymentDate: e.target.value })} /></div>
        <div className="space-y-1.5">
          <Label>Paid From</Label>
          <Select value={f.paymentSourceId || 'none'} onValueChange={v => setF({ ...f, paymentSourceId: v === 'none' ? null : v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— None —</SelectItem>
              {sources.map(s => <SelectItem key={s.id} value={s.id}>{s.name}{s.last4 ? ` ••${s.last4}` : ''}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 md:col-span-2"><Label>Notes</Label><Input value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} /></div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={() => onSubmit(f)} className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white">Mark as Paid</Button>
      </div>
    </div>
  )
}

// ---------- Insight Card ----------
const insightIcons = { calendar: CalendarIcon, zap: Zap, alert: AlertTriangle, trend: TrendingUp, wallet: Wallet, check: CheckCircle2, trash: Trash, pause: PauseCircle }
const insightTones = {
  info: 'from-indigo-500/20 to-blue-500/10 border-indigo-500/30',
  warn: 'from-amber-500/20 to-orange-500/10 border-amber-500/30',
  danger: 'from-rose-500/20 to-red-500/10 border-rose-500/30',
  success: 'from-emerald-500/20 to-teal-500/10 border-emerald-500/30',
}
function Insight({ icon, tone, title, detail }) {
  const Icon = insightIcons[icon] || Lightbulb
  return (
    <motion.div whileHover={{ scale: 1.02, y: -2 }} transition={{ duration: 0.15 }}
      initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
      className={`cursor-default rounded-xl border bg-gradient-to-br p-4 transition-shadow hover:shadow-lg ${insightTones[tone] || insightTones.info}`}>
      <div className="flex items-start gap-3">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-background/40 backdrop-blur">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-foreground">{title}</div>
          <div className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{detail}</div>
        </div>
      </div>
    </motion.div>
  )
}

// ---------- Notification Bell ----------
function NotificationBell({ notifications, onReadAll }) {
  const unread = notifications.filter(n => !n.read).length
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }}
              className="absolute -right-0.5 -top-0.5 grid h-4 w-4 place-items-center rounded-full bg-gradient-to-br from-rose-500 to-pink-600 text-[9px] font-bold text-white shadow-lg">
              {unread}
            </motion.span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="end">
        <div className="flex items-center justify-between border-b border-border/60 p-3">
          <div>
            <div className="text-sm font-semibold">Notifications</div>
            <div className="text-xs text-muted-foreground">{unread} unread</div>
          </div>
          {unread > 0 && <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onReadAll}>Mark all read</Button>}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {notifications.length === 0 && (
            <div className="flex flex-col items-center gap-2 p-6 text-center text-sm text-muted-foreground">
              <Inbox className="h-6 w-6" />
              No notifications
            </div>
          )}
          {notifications.map(n => {
            const Icon = insightIcons[n.tone === 'success' ? 'check' : n.tone === 'danger' ? 'alert' : n.tone === 'warn' ? 'zap' : 'calendar'] || Bell
            const tones = {
              info: 'text-blue-400 bg-blue-500/15', warn: 'text-amber-400 bg-amber-500/15',
              danger: 'text-rose-400 bg-rose-500/15', success: 'text-emerald-400 bg-emerald-500/15',
            }
            return (
              <div key={n.id} className={`flex items-start gap-3 border-b border-border/40 p-3 transition-colors hover:bg-muted/30 ${!n.read ? 'bg-muted/20' : ''}`}>
                <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${tones[n.tone] || tones.info}`}>
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{n.title}</div>
                  <div className="text-xs text-muted-foreground">{n.detail}</div>
                  <div className="mt-0.5 text-[10px] text-muted-foreground">{fmtRel(n.createdAt)}</div>
                </div>
                {!n.read && <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-indigo-500" />}
              </div>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ============== APP ==============
function App() {
  const { theme, setTheme } = useTheme()
  const [view, setView] = useState('dashboard')
  const [subs, setSubs] = useState([])
  const [sources, setSources] = useState([])
  const [stats, setStats] = useState(null)
  const [upcoming, setUpcoming] = useState([])
  const [analytics, setAnalytics] = useState(null)
  const [insights, setInsights] = useState([])
  const [grid, setGrid] = useState(null)
  const [calendarData, setCalendarData] = useState([])
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [fCategory, setFCategory] = useState('all')
  const [fService, setFService] = useState('all')
  const [fStatus, setFStatus] = useState('all')
  const [fAuto, setFAuto] = useState('all')
  const [fSource, setFSource] = useState('all')
  const [preset, setPreset] = useState('all')
  const [calMonthOffset, setCalMonthOffset] = useState(0)
  const [calView, setCalView] = useState('grid')

  const [dialog, setDialog] = useState({ type: null, data: null })

  const load = async () => {
    setLoading(true)
    try {
      const [s, src, st, up, an, ins, gr, cal, notif] = await Promise.all([
        fetch('/api/subscriptions').then(r => r.json()),
        fetch('/api/payment-sources').then(r => r.json()),
        fetch('/api/dashboard/stats').then(r => r.json()),
        fetch('/api/dashboard/upcoming').then(r => r.json()),
        fetch('/api/dashboard/analytics').then(r => r.json()),
        fetch('/api/dashboard/insights').then(r => r.json()),
        fetch('/api/payments/grid').then(r => r.json()),
        fetch('/api/calendar?months=12').then(r => r.json()),
        fetch('/api/notifications').then(r => r.json()),
      ])
      setSubs(Array.isArray(s) ? s : [])
      setSources(Array.isArray(src) ? src : [])
      setStats(st); setUpcoming(Array.isArray(up) ? up : [])
      setAnalytics(an); setInsights(Array.isArray(ins) ? ins : [])
      setGrid(gr); setCalendarData(Array.isArray(cal) ? cal : [])
      setNotifications(Array.isArray(notif) ? notif : [])
    } catch (e) { toast.error('Failed to load') } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const seedDemo = async () => {
    setLoading(true)
    const r = await fetch('/api/seed', { method: 'POST' }).then(r => r.json())
    toast.success(`Loaded ${r.inserted} subscriptions, ${r.sources} sources, ${r.payments} payments`)
    await load()
  }

  const goToList = (p) => { setPreset(p); setView('subscriptions') }

  const saveSub = async (data) => {
    const editing = dialog.data
    const url = editing?.id ? `/api/subscriptions/${editing.id}` : '/api/subscriptions'
    const method = editing?.id ? 'PUT' : 'POST'
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
    if (r.ok) { toast.success(editing?.id ? 'Updated' : 'Created'); setDialog({ type: null, data: null }); load() }
    else toast.error('Save failed')
  }
  const deleteSub = async (id) => {
    if (!confirm('Delete this subscription?')) return
    await fetch(`/api/subscriptions/${id}`, { method: 'DELETE' })
    toast.success('Deleted'); load()
  }
  const setSubStatus = async (sub, status) => {
    await fetch(`/api/subscriptions/${sub.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })
    toast.success(`${sub.platformName} → ${status}`); load()
  }
  const saveSource = async (data) => {
    const editing = dialog.data
    const url = editing?.id ? `/api/payment-sources/${editing.id}` : '/api/payment-sources'
    const method = editing?.id ? 'PUT' : 'POST'
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
    if (r.ok) { toast.success('Saved'); setDialog({ type: null, data: null }); load() }
  }
  const deleteSource = async (id) => {
    if (!confirm('Delete this payment source?')) return
    await fetch(`/api/payment-sources/${id}`, { method: 'DELETE' })
    toast.success('Deleted'); load()
  }
  const addCredits = async (data) => {
    const id = dialog.data?.id
    const r = await fetch(`/api/subscriptions/${id}/credits`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
    if (r.ok) { toast.success('Credits added'); setDialog({ type: null, data: null }); load() }
  }
  const markPaid = async (data) => {
    const { sub, month } = dialog.data
    const r = await fetch('/api/payments', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscriptionId: sub.id, month, status: 'Paid', ...data }),
    })
    if (r.ok) { toast.success(`${sub.platformName} marked paid · auto-synced to Subscriptions`); setDialog({ type: null, data: null }); load() }
  }
  const quickMarkPaid = async (sub, month) => {
    const r = await fetch('/api/payments', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscriptionId: sub.id, month, status: 'Paid', amount: sub.amount, paymentSourceId: sub.paymentSourceId, paymentDate: new Date().toISOString() }),
    })
    if (r.ok) { toast.success(`${sub.platformName} marked paid for ${month}`); load() }
  }
  const undoPayment = async (id) => {
    await fetch(`/api/payments/${id}`, { method: 'DELETE' })
    toast.success('Payment reverted'); load()
  }
  const readAllNotifs = async () => {
    await fetch('/api/notifications/read-all', { method: 'POST' })
    load()
  }

  const filtered = useMemo(() => {
    const thisMonth = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` })()
    return subs.filter(s => {
      // Preset filter
      if (preset === 'active' && !(s.status === 'Active' || s.status === 'Expiring Soon')) return false
      if (preset === 'renewals30') {
        const dt = daysTo(s.renewalDate)
        if (dt === null || dt < 0 || dt > 30) return false
        if (s.status === 'Cancelled' || s.status === 'Hold') return false
      }
      if (preset === 'manualPending') {
        if (s.autoRenewal) return false
        if (s.status === 'Cancelled' || s.status === 'Hold' || s.status === 'Expired') return false
        if (s.paidMonths?.includes(thisMonth)) return false
      }
      if (preset === 'aiOnly' && s.serviceType !== 'AI Tool') return false
      if (preset === 'autoOnly' && !s.autoRenewal) return false
      if (preset === 'expired' && s.status !== 'Expired') return false
      if (preset === 'held' && s.status !== 'Hold') return false

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
      if (fSource !== 'all' && s.paymentSourceId !== fSource) return false
      return true
    })
  }, [subs, search, fCategory, fService, fStatus, fAuto, fSource, preset])

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

  // Multi-month calendar grid
  const calGrid = useMemo(() => {
    const target = new Date()
    target.setMonth(target.getMonth() + calMonthOffset)
    target.setDate(1)
    const y = target.getFullYear(), m = target.getMonth()
    const first = new Date(y, m, 1)
    const startDay = first.getDay()
    const lastDate = new Date(y, m + 1, 0).getDate()
    const cells = []
    for (let i = 0; i < startDay; i++) cells.push(null)
    for (let d = 1; d <= lastDate; d++) {
      const date = new Date(y, m, d)
      const items = subs.filter(s => s.renewalDate && new Date(s.renewalDate).toDateString() === date.toDateString())
        .map(s => {
          let color = 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
          if (s.status === 'Expired') color = 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
          else if (s.status === 'Hold') color = 'bg-sky-500/15 text-sky-300 border border-sky-500/30'
          else if (s.serviceType === 'AI Tool') color = 'bg-purple-500/15 text-purple-300 border border-purple-500/30'
          else if (s.status === 'Expiring Soon') color = 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
          else if (s.autoRenewal) color = 'bg-blue-500/15 text-blue-300 border border-blue-500/30'
          return { ...s, color }
        })
      const today = new Date()
      cells.push({ date, items, isToday: date.toDateString() === today.toDateString() })
    }
    return { cells, monthName: first.toLocaleString('default', { month: 'long', year: 'numeric' }) }
  }, [subs, calMonthOffset])

  const sourceById = (id) => sources.find(s => s.id === id)
  const maxUpcoming = Math.max(1, ...upcoming.map(b => b.total))

  // Active filter title (for subscriptions header)
  const presetLabel = PRESET_LABELS[preset] || 'All Subscriptions'

  // ============== RENDER ==============
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/10">
      <div className="flex">
        <Sidebar active={view} onChange={(v) => { setView(v); if (v !== 'subscriptions') setPreset('all') }} stats={stats} />

        <div className="flex-1 min-w-0">
          <header className="sticky top-0 z-30 border-b border-border/60 bg-background/70 backdrop-blur-xl">
            <div className="flex h-16 items-center justify-between gap-3 px-4 md:px-6">
              <div className="flex items-center gap-3 md:hidden">
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600"><Wallet className="h-4 w-4 text-white" /></div>
                <span className="text-base font-bold">SubsHub</span>
              </div>
              <div className="hidden md:block">
                <div className="text-lg font-bold capitalize">{NAV.find(n => n.id === view)?.label || ''}</div>
                <div className="text-xs text-muted-foreground">
                  {view === 'dashboard' && 'Subscription intelligence overview'}
                  {view === 'subscriptions' && presetLabel}
                  {view === 'payments' && 'Track manual payments month-wise'}
                  {view === 'sources' && 'Cards, banks & payment methods'}
                  {view === 'calendar' && 'Renewals at a glance'}
                  {view === 'ai' && 'AI tools, credits & usage'}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative hidden md:block">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search anything..." className="w-64 pl-9 transition-all focus:w-80" />
                </div>
                <NotificationBell notifications={notifications} onReadAll={readAllNotifs} />
                <Button variant="ghost" size="icon" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="transition-transform hover:rotate-12">
                  {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </Button>
                <Button variant="outline" size="sm" onClick={load} disabled={loading}><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /></Button>
                <Button size="sm" onClick={() => setDialog({ type: 'sub', data: null })} className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-500/30 transition-transform hover:scale-105">
                  <Plus className="mr-1.5 h-4 w-4" /> New
                </Button>
              </div>
            </div>
          </header>

          <main className="p-4 md:p-6">
            {/* DASHBOARD */}
            {view === 'dashboard' && (
              <div className="space-y-6">
                {(!stats || stats.totalSubscriptions === 0) ? (
                  <Card className="border-dashed bg-gradient-to-br from-indigo-500/5 to-purple-600/5">
                    <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg"><Sparkles className="h-6 w-6" /></div>
                      <div className="text-lg font-semibold">Welcome to SubsHub</div>
                      <div className="max-w-md text-sm text-muted-foreground">Load sample data to explore the intelligence platform.</div>
                      <div className="flex gap-2">
                        <Button onClick={seedDemo} className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white">Load Demo Data</Button>
                        <Button variant="outline" onClick={() => setDialog({ type: 'sub', data: null })}><Plus className="mr-1.5 h-4 w-4" />Add Subscription</Button>
                      </div>
                    </CardContent>
                  </Card>
                ) : null}

                {/* KPIs row 1 — clickable */}
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <Kpi icon={Activity} label="Active" value={stats?.activeSubscriptions ?? 0} sub={`${stats?.totalSubscriptions ?? 0} total`} accent="from-emerald-500 to-teal-600" onClick={() => goToList('active')} />
                  <Kpi icon={Wallet} label="Monthly Spend" value={fmtINR(stats?.monthlySpend)} sub={`Annual ${fmtINR(stats?.annualSpend)}`} accent="from-indigo-500 to-purple-600" onClick={() => goToList('all')} />
                  <Kpi icon={Clock} label="Renewals 30d" value={stats?.upcomingRenewals ?? 0} sub={`${stats?.expiringSoon ?? 0} expiring soon`} accent="from-amber-500 to-orange-600" onClick={() => goToList('renewals30')} />
                  <Kpi icon={Receipt} label="Manual Pending" value={stats?.manualPending ?? 0} sub={`${stats?.paidThisMonth ?? 0} paid this month`} accent="from-rose-500 to-pink-600" onClick={() => goToList('manualPending')} />
                </div>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <Kpi icon={Zap} label="AI Credits Left" value={(stats?.aiCreditsRemaining ?? 0).toLocaleString()} sub="Across all AI tools" accent="from-purple-500 to-fuchsia-600" onClick={() => goToList('aiOnly')} />
                  <Kpi icon={CheckCircle2} label="Auto-renew" value={stats?.autoRenewalCount ?? 0} sub="On auto-pay" accent="from-blue-500 to-cyan-600" onClick={() => goToList('autoOnly')} />
                  <Kpi icon={PauseCircle} label="On Hold" value={stats?.onHold ?? 0} sub="Manually paused" accent="from-sky-500 to-blue-600" onClick={() => goToList('held')} />
                  <Kpi icon={AlertTriangle} label="Expired" value={stats?.expired ?? 0} sub="Needs attention" accent="from-red-500 to-rose-600" onClick={() => goToList('expired')} />
                </div>

                {/* 8 Smart Insights */}
                <Card className="border-border/60 bg-card/40 backdrop-blur">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Lightbulb className="h-4 w-4 text-amber-400" /> Smart Insights</CardTitle>
                    <CardDescription>Computed intelligence — 8 key signals from your subscription data</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
                      {insights.map((i, idx) => <Insight key={idx} {...i} />)}
                    </div>
                  </CardContent>
                </Card>

                {/* Upcoming Payments — redesigned */}
                <Card className="border-border/60 bg-card/60 backdrop-blur">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><TrendingUp className="h-4 w-4 text-emerald-400" /> Upcoming Payments Forecast</CardTitle>
                    <CardDescription>6-month cash-flow projection · visualize your spending pattern</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                      {upcoming.map((b, i) => {
                        const pct = (b.total / maxUpcoming) * 100
                        const isCurrent = i === 0
                        return (
                          <motion.div key={b.key} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                            whileHover={{ y: -3, scale: 1.01 }}
                            className={`group relative overflow-hidden rounded-xl border bg-gradient-to-br p-4 transition-all hover:shadow-xl hover:shadow-indigo-500/10 ${isCurrent ? 'border-indigo-500/40 from-indigo-500/10 to-purple-600/5' : 'border-border/60 from-background to-muted/30'}`}>
                            <div className="flex items-start justify-between">
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{b.monthShort}</span>
                                  <span className="text-[10px] text-muted-foreground">{b.year}</span>
                                  {isCurrent && <Badge variant="outline" className="h-4 border-indigo-500/40 bg-indigo-500/15 px-1.5 text-[9px] text-indigo-400">Current</Badge>}
                                </div>
                                <div className="mt-1 text-2xl font-bold tracking-tight">{fmtINR(b.total)}</div>
                              </div>
                              <Badge variant="outline" className="text-[10px]">{b.items.length} {b.items.length === 1 ? 'pmt' : 'pmts'}</Badge>
                            </div>
                            <div className="mt-3">
                              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                                <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ delay: 0.2 + i * 0.05, duration: 0.6 }}
                                  className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-600" />
                              </div>
                            </div>
                            {b.items.length > 0 && (
                              <div className="mt-3 space-y-1 max-h-24 overflow-hidden">
                                {b.items.slice(0, 3).map(it => (
                                  <div key={it.id} className="flex items-center justify-between text-xs">
                                    <span className="truncate text-muted-foreground">• {it.platform}</span>
                                    <span className="ml-2 shrink-0 font-medium">{fmtINR(it.amount)}</span>
                                  </div>
                                ))}
                                {b.items.length > 3 && <div className="text-[10px] text-muted-foreground">+{b.items.length - 3} more</div>}
                              </div>
                            )}
                          </motion.div>
                        )
                      })}
                    </div>
                  </CardContent>
                </Card>

                {/* Top Expensive + Charts */}
                <div className="grid gap-4 lg:grid-cols-3">
                  <Card className="border-border/60 bg-card/60 backdrop-blur lg:col-span-2">
                    <CardHeader><CardTitle>Spend by Service Type</CardTitle><CardDescription>Where the money goes</CardDescription></CardHeader>
                    <CardContent className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={analytics?.byServiceType || []}>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
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

                  <Card className="border-border/60 bg-card/60 backdrop-blur">
                    <CardHeader><CardTitle className="flex items-center gap-2"><Layers className="h-4 w-4" /> Top Expensive</CardTitle><CardDescription>Click to view</CardDescription></CardHeader>
                    <CardContent className="space-y-2">
                      {(stats?.topExpensive || []).map((t, i) => (
                        <motion.div key={t.id} whileHover={{ x: 4 }}
                          onClick={() => { setSearch(t.platformName); setView('subscriptions') }}
                          className="flex cursor-pointer items-center justify-between rounded-lg border border-border/40 bg-muted/20 p-2.5 transition-all hover:border-indigo-500/40 hover:bg-muted/40">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-gradient-to-br from-indigo-500/20 to-purple-600/20 text-xs font-semibold">{i + 1}</div>
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium">{t.platformName}</div>
                              <div className="text-[10px] text-muted-foreground">{t.category}</div>
                            </div>
                          </div>
                          <div className="text-sm font-semibold">{fmtINR(t.monthlyCost)}</div>
                        </motion.div>
                      ))}
                    </CardContent>
                  </Card>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <Card className="border-border/60 bg-card/60 backdrop-blur">
                    <CardHeader><CardTitle>Spend by Category</CardTitle><CardDescription>Agency vs Client vs Internal</CardDescription></CardHeader>
                    <CardContent className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={analytics?.byCategory || []} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={55} paddingAngle={3}>
                            {(analytics?.byCategory || []).map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                          </Pie>
                          <Tooltip formatter={(v) => fmtINR(v)} contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <Card className="border-border/60 bg-card/60 backdrop-blur">
                    <CardHeader><CardTitle>12-Month Payment Trend</CardTitle><CardDescription>Renewal distribution across months</CardDescription></CardHeader>
                    <CardContent className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={analytics?.trend || []}>
                          <defs>
                            <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.5} />
                              <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                          <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} />
                          <Tooltip formatter={(v) => fmtINR(v)} contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
                          <Area type="monotone" dataKey="amount" stroke="#8b5cf6" strokeWidth={2.5} fill="url(#grad)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}

            {/* SUBSCRIPTIONS */}
            {view === 'subscriptions' && (
              <div className="space-y-4">
                {preset !== 'all' && (
                  <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
                    <Card className="border-indigo-500/40 bg-gradient-to-r from-indigo-500/10 to-purple-600/5">
                      <CardContent className="flex items-center justify-between p-3">
                        <div className="flex items-center gap-2 text-sm">
                          <Filter className="h-4 w-4 text-indigo-400" />
                          <span className="font-medium">Filter:</span>
                          <Badge variant="outline" className="border-indigo-500/40 bg-indigo-500/20 text-indigo-300">{presetLabel}</Badge>
                          <span className="text-muted-foreground">· {filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
                        </div>
                        <Button size="sm" variant="ghost" onClick={() => setPreset('all')} className="h-7"><X className="mr-1 h-3 w-3" />Clear</Button>
                      </CardContent>
                    </Card>
                  </motion.div>
                )}

                <Card className="border-border/60">
                  <CardContent className="flex flex-wrap items-center gap-2 p-4">
                    <Filter className="h-4 w-4 text-muted-foreground" />
                    <Select value={fCategory} onValueChange={setFCategory}>
                      <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="all">All Categories</SelectItem>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                    </Select>
                    <Select value={fService} onValueChange={setFService}>
                      <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="all">All Service Types</SelectItem>{SERVICE_TYPES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                    </Select>
                    <Select value={fStatus} onValueChange={setFStatus}>
                      <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="all">All Statuses</SelectItem>{STATUSES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                    </Select>
                    <Select value={fAuto} onValueChange={setFAuto}>
                      <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Renewal: All</SelectItem>
                        <SelectItem value="yes">Auto Renewal</SelectItem>
                        <SelectItem value="no">Manual Renewal</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={fSource} onValueChange={setFSource}>
                      <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Sources</SelectItem>
                        {sources.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <div className="relative ml-auto">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." className="w-56 pl-9" />
                    </div>
                    <Button variant="outline" size="sm" onClick={exportCSV}><Download className="mr-1.5 h-3.5 w-3.5" /> Export</Button>
                  </CardContent>
                </Card>

                <Card className="overflow-hidden border-border/60">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead>Platform</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Renewal</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Payment</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead>Owner</TableHead>
                        <TableHead className="w-12"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.length === 0 && <TableRow><TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">No subscriptions match the filters</TableCell></TableRow>}
                      {filtered.map(s => {
                        const dt = daysTo(s.renewalDate)
                        const src = sourceById(s.paymentSourceId)
                        return (
                          <motion.tr key={s.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="border-b border-border/40 transition-colors hover:bg-muted/30">
                            <TableCell>
                              <div className="font-medium">{s.platformName}</div>
                              <div className="text-xs text-muted-foreground">{s.serviceType} · {s.subscriptionType}</div>
                            </TableCell>
                            <TableCell><Badge variant="outline" className="font-normal">{s.category}</Badge></TableCell>
                            <TableCell className="font-medium">{fmtINR(s.amount)}</TableCell>
                            <TableCell>
                              <div className="text-sm">{fmtDate(s.renewalDate)}</div>
                              {dt !== null && <div className={`text-xs ${dt < 0 ? 'text-rose-500' : dt <= 7 ? 'text-amber-500' : 'text-muted-foreground'}`}>{dt < 0 ? `${Math.abs(dt)}d ago` : dt === 0 ? 'Today' : `in ${dt}d`}</div>}
                            </TableCell>
                            <TableCell><Badge variant="outline" className={statusBadge(s.status)}>{s.status}</Badge></TableCell>
                            <TableCell>
                              <div className="flex flex-col gap-1">
                                {s.autoRenewal ? (
                                  <Badge variant="outline" className="w-fit border-blue-500/30 bg-blue-500/15 text-blue-400">Auto</Badge>
                                ) : (
                                  <>
                                    <Badge variant="outline" className="w-fit border-amber-500/30 bg-amber-500/15 text-amber-400">Manual</Badge>
                                    {s.isPaidThisMonth ? (
                                      <Badge variant="outline" className="w-fit border-emerald-500/30 bg-emerald-500/15 text-emerald-400 text-[10px]"><CheckCircle2 className="mr-1 h-2.5 w-2.5" />Paid this month</Badge>
                                    ) : s.status !== 'Hold' && s.status !== 'Cancelled' && s.status !== 'Expired' ? (
                                      <button onClick={() => quickMarkPaid(s, (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` })())}
                                        className="w-fit rounded-md border border-rose-500/30 bg-rose-500/15 px-1.5 py-0.5 text-[10px] text-rose-400 hover:bg-rose-500/25 transition-colors">
                                        Mark Paid
                                      </button>
                                    ) : null}
                                  </>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-xs">{src ? <span>{src.name}{src.last4 && <span className="text-muted-foreground"> ••{src.last4}</span>}</span> : <span className="text-muted-foreground">—</span>}</TableCell>
                            <TableCell className="text-sm">{s.paymentOwner || '—'}</TableCell>
                            <TableCell>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => setDialog({ type: 'sub', data: s })}><Pencil className="mr-2 h-3.5 w-3.5" /> Edit</DropdownMenuItem>
                                  {s.status !== 'Hold' && <DropdownMenuItem onClick={() => setSubStatus(s, 'Hold')}><PauseCircle className="mr-2 h-3.5 w-3.5" /> Put on Hold</DropdownMenuItem>}
                                  {s.status === 'Hold' && <DropdownMenuItem onClick={() => setSubStatus(s, 'Active')}><CheckCircle2 className="mr-2 h-3.5 w-3.5" /> Resume</DropdownMenuItem>}
                                  {s.status !== 'Cancelled' && <DropdownMenuItem onClick={() => setSubStatus(s, 'Cancelled')}><X className="mr-2 h-3.5 w-3.5" /> Cancel</DropdownMenuItem>}
                                  <DropdownMenuItem onClick={() => deleteSub(s.id)} className="text-rose-500"><Trash2 className="mr-2 h-3.5 w-3.5" /> Delete</DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </motion.tr>
                        )
                      })}
                    </TableBody>
                  </Table>
                </Card>
              </div>
            )}

            {/* PAYMENTS */}
            {view === 'payments' && (
              <div className="space-y-4">
                <Card className="border-border/60 bg-gradient-to-br from-amber-500/5 to-orange-500/5">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2"><Receipt className="h-4 w-4" /> Manual Payment Tracker</CardTitle>
                        <CardDescription>Paid status auto-syncs to Subscriptions table</CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/15 text-emerald-400">{stats?.paidThisMonth ?? 0} Paid</Badge>
                        <Badge variant="outline" className="border-amber-500/30 bg-amber-500/15 text-amber-400">{stats?.manualPending ?? 0} Pending</Badge>
                      </div>
                    </div>
                  </CardHeader>
                </Card>

                <Card className="overflow-x-auto border-border/60">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead className="sticky left-0 z-10 bg-card">Platform</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Source</TableHead>
                        {(grid?.months || []).map(m => <TableHead key={m.key} className="text-center text-xs">{m.label}</TableHead>)}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(!grid || grid.rows?.length === 0) && <TableRow><TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">No manual-renewal subscriptions</TableCell></TableRow>}
                      {(grid?.rows || []).map(r => {
                        const sub = subs.find(s => s.id === r.id)
                        const src = sourceById(r.paymentSourceId)
                        return (
                          <TableRow key={r.id} className="transition-colors hover:bg-muted/20">
                            <TableCell className="sticky left-0 z-10 bg-card">
                              <div className="font-medium">{r.platformName}</div>
                              {r.status === 'Hold' && <Badge variant="outline" className="mt-0.5 border-sky-500/30 bg-sky-500/15 text-sky-400 text-[10px]">On Hold</Badge>}
                            </TableCell>
                            <TableCell className="font-medium">{fmtINR(r.amount)}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{src?.name || '—'}</TableCell>
                            {(grid.months || []).map(m => {
                              const cell = r.months[m.key]
                              const isPaid = cell?.status === 'Paid'
                              return (
                                <TableCell key={m.key} className="text-center">
                                  {isPaid ? (
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <motion.button whileHover={{ scale: 1.05 }}
                                          className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/15 px-2 py-1 text-xs text-emerald-400 transition-all hover:bg-emerald-500/25 hover:shadow-md">
                                          <CheckCircle2 className="h-3 w-3" /> Paid
                                        </motion.button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent>
                                        <DropdownMenuItem disabled className="text-[10px]">TXN: {cell.transactionId || '—'}</DropdownMenuItem>
                                        <DropdownMenuItem disabled className="text-[10px]">{fmtDate(cell.paymentDate)}</DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => undoPayment(cell.id)} className="text-rose-500"><X className="mr-2 h-3 w-3" />Revert</DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  ) : (
                                    <motion.button whileHover={{ scale: 1.05 }} onClick={() => setDialog({ type: 'pay', data: { sub, month: m.key } })}
                                      className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/15 px-2 py-1 text-xs text-amber-400 transition-all hover:bg-amber-500/25 hover:shadow-md">
                                      Pending
                                    </motion.button>
                                  )}
                                </TableCell>
                              )
                            })}
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </Card>
              </div>
            )}

            {/* PAYMENT SOURCES */}
            {view === 'sources' && (
              <div className="space-y-4">
                <div className="flex items-center justify-end">
                  <Button onClick={() => setDialog({ type: 'source', data: null })} className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white transition-transform hover:scale-105">
                    <Plus className="mr-1.5 h-4 w-4" /> Add Payment Source
                  </Button>
                </div>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {sources.length === 0 && <Card className="col-span-full border-dashed"><CardContent className="py-10 text-center text-sm text-muted-foreground">No payment sources yet</CardContent></Card>}
                  {sources.map(s => (
                    <motion.div key={s.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} whileHover={{ y: -4 }}>
                      <Card className="relative overflow-hidden border-border/60 bg-gradient-to-br from-indigo-600/10 via-purple-600/5 to-transparent transition-all hover:border-indigo-500/40 hover:shadow-xl hover:shadow-indigo-500/10">
                        <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 opacity-20 blur-3xl" />
                        <CardContent className="relative p-5">
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="text-xs uppercase tracking-wider text-muted-foreground">{s.type}</div>
                              <div className="mt-1 text-base font-bold">{s.name}</div>
                              {s.bank && <div className="text-xs text-muted-foreground">{s.bank}</div>}
                            </div>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => setDialog({ type: 'source', data: s })}><Pencil className="mr-2 h-3.5 w-3.5" />Edit</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => deleteSource(s.id)} className="text-rose-500"><Trash2 className="mr-2 h-3.5 w-3.5" />Delete</DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                          <div className="mt-6 font-mono text-lg tracking-widest">
                            {s.last4 ? `•••• •••• •••• ${s.last4}` : <span className="text-muted-foreground">No card details</span>}
                          </div>
                          <div className="mt-4 flex items-end justify-between text-xs">
                            <div><div className="text-[10px] uppercase text-muted-foreground">Owner</div><div>{s.owner || '—'}</div></div>
                            <div><div className="text-[10px] uppercase text-muted-foreground">Expires</div><div>{s.expiryDate || '—'}</div></div>
                            {s.isDefault && <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/15 text-emerald-400">Default</Badge>}
                          </div>
                          <Separator className="my-4" />
                          <div className="grid grid-cols-3 gap-2 text-center">
                            <div><div className="text-[10px] uppercase text-muted-foreground">Subs</div><div className="text-base font-semibold">{s.attachedCount}</div></div>
                            <div><div className="text-[10px] uppercase text-muted-foreground">Monthly</div><div className="text-base font-semibold">{fmtINR(s.monthlySpend)}</div></div>
                            <div><div className="text-[10px] uppercase text-muted-foreground">Yearly</div><div className="text-base font-semibold">{fmtINR(s.yearlySpend)}</div></div>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            {/* CALENDAR */}
            {view === 'calendar' && (
              <div className="space-y-4">
                {/* Header with view toggle + month nav */}
                <Card className="border-border/60">
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => setCalView('grid')} className={calView === 'grid' ? 'border-indigo-500/50 bg-indigo-500/10' : ''}>Grid View</Button>
                      <Button variant="outline" size="sm" onClick={() => setCalView('list')} className={calView === 'list' ? 'border-indigo-500/50 bg-indigo-500/10' : ''}>Month List</Button>
                    </div>
                    {calView === 'grid' && (
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCalMonthOffset(o => o - 1)}><ChevronLeft className="h-4 w-4" /></Button>
                        <div className="min-w-[160px] text-center text-sm font-semibold">{calGrid.monthName}</div>
                        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCalMonthOffset(o => o + 1)}><ChevronRight className="h-4 w-4" /></Button>
                        {calMonthOffset !== 0 && <Button variant="ghost" size="sm" onClick={() => setCalMonthOffset(0)} className="h-8 text-xs">Today</Button>}
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-3 text-xs">
                      <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Active</span>
                      <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-500" /> Expiring</span>
                      <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-rose-500" /> Expired</span>
                      <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-blue-500" /> Auto-renew</span>
                      <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-purple-500" /> AI Tool</span>
                      <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-sky-500" /> On Hold</span>
                    </div>
                  </CardContent>
                </Card>

                {/* Grid view */}
                {calView === 'grid' && (
                  <motion.div key={calMonthOffset} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2 }}>
                    <Card className="border-border/60">
                      <CardContent className="p-4">
                        <div className="grid grid-cols-7 gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                          {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => <div key={d} className="py-1 text-center">{d}</div>)}
                        </div>
                        <div className="mt-2 grid grid-cols-7 gap-2">
                          {calGrid.cells.map((c, i) => (
                            <motion.div key={i} whileHover={c ? { scale: 1.03, zIndex: 5 } : {}} transition={{ duration: 0.15 }}
                              className={`min-h-[110px] rounded-lg border p-2 transition-shadow ${c ? (c.isToday ? 'border-indigo-500/60 bg-indigo-500/5 ring-2 ring-indigo-500/40 shadow-lg shadow-indigo-500/10' : 'border-border/60 bg-card/40 hover:border-indigo-500/30 hover:shadow-md') : 'border-transparent'}`}>
                              {c && (
                                <>
                                  <div className={`text-xs font-semibold ${c.isToday ? 'text-indigo-400' : ''}`}>{c.date.getDate()}</div>
                                  <div className="mt-1 space-y-1">
                                    {c.items.slice(0, 3).map(it => (
                                      <div key={it.id} className={`truncate rounded px-1.5 py-0.5 text-[10px] transition-transform hover:scale-105 ${it.color}`} title={`${it.platformName} · ${fmtINR(it.amount)}`}>
                                        {it.platformName}
                                      </div>
                                    ))}
                                    {c.items.length > 3 && <div className="text-[10px] text-muted-foreground">+{c.items.length - 3} more</div>}
                                  </div>
                                </>
                              )}
                            </motion.div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                )}

                {/* Month list view */}
                {calView === 'list' && (
                  <div className="space-y-4">
                    {calendarData.filter(g => g.items.length > 0).map(g => (
                      <motion.div key={g.key} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                        <Card className="border-border/60 transition-all hover:border-indigo-500/30 hover:shadow-lg">
                          <CardHeader>
                            <div className="flex items-center justify-between">
                              <CardTitle className="text-base">{g.monthName}</CardTitle>
                              <div className="flex items-center gap-2">
                                <Badge variant="outline">{g.items.length} renewal{g.items.length !== 1 ? 's' : ''}</Badge>
                                <Badge variant="outline" className="border-indigo-500/40 bg-indigo-500/10 text-indigo-300">{fmtINR(g.total)}</Badge>
                              </div>
                            </div>
                          </CardHeader>
                          <CardContent className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                            {g.items.map(it => {
                              const dot = it.serviceType === 'AI Tool' ? 'bg-purple-500' : it.status === 'Expired' ? 'bg-rose-500' : it.status === 'Hold' ? 'bg-sky-500' : it.status === 'Expiring Soon' ? 'bg-amber-500' : it.autoRenewal ? 'bg-blue-500' : 'bg-emerald-500'
                              return (
                                <motion.div key={it.id} whileHover={{ x: 4 }}
                                  className="flex items-center justify-between rounded-lg border border-border/40 bg-muted/20 p-2.5 transition-all hover:border-indigo-500/40 hover:bg-muted/40">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
                                    <div className="min-w-0">
                                      <div className="truncate text-sm font-medium">{it.platformName}</div>
                                      <div className="text-[10px] text-muted-foreground">{fmtDate(it.renewalDate)} · {it.category}</div>
                                    </div>
                                  </div>
                                  <div className="text-sm font-semibold">{fmtINR(it.amount)}</div>
                                </motion.div>
                              )
                            })}
                          </CardContent>
                        </Card>
                      </motion.div>
                    ))}
                    {calendarData.filter(g => g.items.length > 0).length === 0 && (
                      <Card className="border-dashed"><CardContent className="py-10 text-center text-sm text-muted-foreground">No upcoming renewals in the next 12 months</CardContent></Card>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* AI CREDITS */}
            {view === 'ai' && (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {aiTools.length === 0 && <Card className="col-span-full border-dashed"><CardContent className="py-10 text-center text-sm text-muted-foreground">No AI tools tracked yet</CardContent></Card>}
                {aiTools.map(t => {
                  const total = Number(t.totalCredits || t.creditsAvailable || 0)
                  const remaining = Number(t.creditsRemaining || 0)
                  const consumed = Math.max(0, total - remaining)
                  const pct = total ? Math.min(100, Math.round((remaining / total) * 100)) : 0
                  const low = pct < 25
                  const purchaseCount = (t.creditPurchases || []).length
                  const purchaseDate = t.purchaseDate ? new Date(t.purchaseDate) : null
                  let exhaustionEst = null
                  if (purchaseDate && consumed > 0 && remaining > 0) {
                    const daysSince = Math.max(1, Math.round((Date.now() - purchaseDate.getTime()) / 86400000))
                    const burn = consumed / daysSince
                    if (burn > 0) exhaustionEst = Math.round(remaining / burn)
                  }
                  return (
                    <motion.div key={t.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} whileHover={{ y: -4 }}>
                      <Card className="relative overflow-hidden border-border/60 bg-gradient-to-br from-purple-600/5 to-fuchsia-600/5 transition-all hover:border-purple-500/40 hover:shadow-xl hover:shadow-purple-500/10">
                        {low && <div className="absolute right-3 top-3"><Badge variant="outline" className="border-rose-500/30 bg-rose-500/15 text-rose-400"><AlertTriangle className="mr-1 h-3 w-3" /> Low</Badge></div>}
                        <CardHeader className="pb-3">
                          <CardTitle className="flex items-center gap-2 text-base"><Sparkles className="h-4 w-4 text-purple-400" /> {t.platformName}</CardTitle>
                          <CardDescription className="text-xs">{t.subscriptionType} · {fmtINR(t.amount)} · Renews {fmtDate(t.renewalDate)}</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div>
                            <div className="flex items-baseline justify-between">
                              <span className="text-xs text-muted-foreground">Remaining</span>
                              <span className="text-sm font-bold">{remaining.toLocaleString()} <span className="text-xs font-normal text-muted-foreground">/ {total.toLocaleString()}</span></span>
                            </div>
                            <Progress value={pct} className="mt-2 h-2" />
                            <div className={`mt-1 flex items-center justify-between text-[10px] ${low ? 'text-rose-400' : 'text-muted-foreground'}`}>
                              <span>{pct}% remaining</span>
                              {exhaustionEst !== null && <span>~{exhaustionEst}d to exhaustion</span>}
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted/30 p-2 text-center">
                            <div><div className="text-[10px] uppercase text-muted-foreground">Total</div><div className="text-sm font-semibold">{total.toLocaleString()}</div></div>
                            <div><div className="text-[10px] uppercase text-muted-foreground">Used</div><div className="text-sm font-semibold">{consumed.toLocaleString()}</div></div>
                            <div><div className="text-[10px] uppercase text-muted-foreground">Add-ons</div><div className="text-sm font-semibold">{Math.max(0, purchaseCount - 1)}</div></div>
                          </div>
                          {(t.creditPurchases || []).length > 0 && (
                            <details className="rounded-lg border border-border/40 bg-muted/20 p-2">
                              <summary className="cursor-pointer text-xs font-medium">Purchase history ({purchaseCount})</summary>
                              <div className="mt-2 space-y-1">
                                {(t.creditPurchases || []).slice().reverse().map(p => (
                                  <div key={p.id} className="flex items-center justify-between text-[11px]">
                                    <span className="text-muted-foreground">{p.type === 'initial' ? 'Initial' : 'Addon'} · {fmtDate(p.purchasedAt)}</span>
                                    <span className="font-medium">+{Number(p.credits).toLocaleString()}</span>
                                  </div>
                                ))}
                              </div>
                            </details>
                          )}
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" className="flex-1 transition-transform hover:scale-105" onClick={() => setDialog({ type: 'addon', data: t })}><Plus className="mr-1 h-3 w-3" />Top-up</Button>
                            <Button size="sm" variant="outline" className="flex-1 transition-transform hover:scale-105" onClick={() => setDialog({ type: 'sub', data: t })}>Edit</Button>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  )
                })}
              </div>
            )}
          </main>
        </div>
      </div>

      {/* Dialogs */}
      <Dialog open={dialog.type === 'sub'} onOpenChange={(o) => !o && setDialog({ type: null, data: null })}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{dialog.data?.id ? 'Edit Subscription' : 'Add New Subscription'}</DialogTitle>
            <DialogDescription>Fill in details to track this subscription</DialogDescription>
          </DialogHeader>
          <SubscriptionForm initial={dialog.data} sources={sources} onSubmit={saveSub} onCancel={() => setDialog({ type: null, data: null })} />
        </DialogContent>
      </Dialog>

      <Dialog open={dialog.type === 'source'} onOpenChange={(o) => !o && setDialog({ type: null, data: null })}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{dialog.data?.id ? 'Edit Payment Source' : 'Add Payment Source'}</DialogTitle>
            <DialogDescription>Track cards & accounts</DialogDescription>
          </DialogHeader>
          <SourceForm initial={dialog.data} onSubmit={saveSource} onCancel={() => setDialog({ type: null, data: null })} />
        </DialogContent>
      </Dialog>

      <Dialog open={dialog.type === 'addon'} onOpenChange={(o) => !o && setDialog({ type: null, data: null })}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Credits — {dialog.data?.platformName}</DialogTitle>
            <DialogDescription>Record a credit top-up</DialogDescription>
          </DialogHeader>
          <AddonForm onSubmit={addCredits} onCancel={() => setDialog({ type: null, data: null })} />
        </DialogContent>
      </Dialog>

      <Dialog open={dialog.type === 'pay'} onOpenChange={(o) => !o && setDialog({ type: null, data: null })}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Mark Payment Done</DialogTitle>
            <DialogDescription>Auto-syncs to Subscriptions table</DialogDescription>
          </DialogHeader>
          <MarkPaymentForm sub={dialog.data?.sub} month={dialog.data?.month} sources={sources} onSubmit={markPaid} onCancel={() => setDialog({ type: null, data: null })} />
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default App
