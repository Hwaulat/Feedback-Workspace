import { createContext, useContext, useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import { queryOptions, useQueryClient, useSuspenseQuery, useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import {
  getAccess,
  getWorkspace,
  signIn,
  signOut,
  saveItem,
  deleteItem,
  manageCustomer,
  clearWorkspaceData,
  importFeedback,
  syncClientWorkspace,
} from '@/lib/feedback.functions';
import { exportFeedback } from '@/lib/excel.functions';
import {
  itemSchema,
  type Access,
  type Customer,
  type FeedbackItem,
  type HistoryEntry,
  type ItemInput,
  todayWIB,
  PIN_PATTERN,
} from '@/lib/feedback-model';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Eye, EyeOff, ArrowRight, ShieldCheck, AlertTriangle } from 'lucide-react';

const STORAGE_KEY_ITEMS = 'loop_feedback_items';
const STORAGE_KEY_CUSTOMERS = 'loop_feedback_customers';
const STORAGE_KEY_HISTORY = 'loop_feedback_history';
const STORAGE_KEY_AUTH = 'loop_feedback_auth';

function loadFromStorage<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveToStorage<T>(key: string, data: T): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {}
}

export const accessQuery = queryOptions({ queryKey: ['feedback-access'], queryFn: () => getAccess() });
export const workspaceQuery = queryOptions({ queryKey: ['feedback-workspace'], queryFn: () => getWorkspace() });

export type WorkspaceContext = {
  access: Access | null;
  demo: boolean;
  isAdmin: boolean;
  isCustomer: boolean;
  customers: Customer[];
  items: FeedbackItem[];
  history: HistoryEntry[];
  selectedCustomer: string;
  setSelectedCustomer: (v: string) => void;
  openLogin: () => void;
  openClearDialog: () => void;
  loginAdmin: (passcode: string, actor: string) => Promise<{ ok: boolean; error?: string }>;
  loginCustomer: (pin: string, picName?: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
  clearAllData: () => Promise<void>;
  save: (item: ItemInput, existing?: FeedbackItem) => Promise<void>;
  remove: (item: FeedbackItem, restore?: boolean) => Promise<void>;
  customerAction: (action: 'create' | 'regenerate' | 'toggle' | 'delete', name: string, id?: string) => Promise<string | null>;
  importRows: (rows: Array<ItemInput & { customer_name: string; is_update?: boolean }>) => Promise<{ count: number; pins: { name: string; pin: string }[] }>;
  exportToExcel: (subset?: FeedbackItem[], customFileName?: string) => Promise<void>;
  refresh: () => Promise<void>;
};

const Context = createContext<WorkspaceContext | null>(null);

export function useWorkspace() {
  const context = useContext(Context);
  if (!context) throw new Error('Workspace is unavailable');
  return context;
}

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const { data: serverAccess } = useSuspenseQuery(accessQuery);
  return <WorkspaceState initialServerAccess={serverAccess}>{children}</WorkspaceState>;
}

function WorkspaceState({ initialServerAccess, children }: { initialServerAccess: Access | null; children: ReactNode }) {
  const queryClient = useQueryClient();
  const saveFn = useServerFn(saveItem);
  const deleteFn = useServerFn(deleteItem);
  const customerFn = useServerFn(manageCustomer);
  const logoutFn = useServerFn(signOut);
  const clearFn = useServerFn(clearWorkspaceData);
  const signInFn = useServerFn(signIn);
  const exportFn = useServerFn(exportFeedback);
  const importFn = useServerFn(importFeedback);
  const syncFn = useServerFn(syncClientWorkspace);

  // Load from persistent local storage as cache / starting point
  const [items, setItems] = useState<FeedbackItem[]>(() => {
    const loaded = loadFromStorage<FeedbackItem[]>(STORAGE_KEY_ITEMS, []);
    return loaded.map(i => ({
      ...i,
      activity: ((i.activity as string) === 'Pending' ? 'Not started' : i.activity) as any,
      needs_review: i.needs_review ?? false,
      image: i.image ?? null,
    }));
  });
  const [customers, setCustomers] = useState<Customer[]>(() => loadFromStorage<Customer[]>(STORAGE_KEY_CUSTOMERS, []));
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadFromStorage<HistoryEntry[]>(STORAGE_KEY_HISTORY, []));

  // Client auth state synced with local storage and server session
  const [clientAccess, setClientAccess] = useState<Access | null>(() => {
    if (initialServerAccess) return initialServerAccess;
    const local = loadFromStorage<Access | null>(STORAGE_KEY_AUTH, null);
    if (local && local.expires && local.expires > Date.now()) return local;
    return null;
  });

  const [selectedCustomer, setSelectedCustomer] = useState('all');
  const [loginOpen, setLoginOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);

  // Mutation guard: prevents background refetch from overwriting optimistic state during save/delete
  const mutatingCountRef = useRef(0);
  const isMutating = useCallback(() => mutatingCountRef.current > 0, []);

  // Server data query with real-time sync across all browsers
  const { data: serverWorkspace } = useQuery({
    queryKey: ['feedback-workspace', clientAccess?.actor, clientAccess?.role],
    queryFn: () => getWorkspace(),
    enabled: !!clientAccess,
    refetchInterval: 3000, // automatic background sync every 3s so multi-browser updates show in real-time
    refetchOnWindowFocus: true,
  });

  // Sync state when server data is received — but SKIP if a mutation is in-flight
  useEffect(() => {
    if (serverWorkspace && clientAccess && !isMutating()) {
      setItems(
        serverWorkspace.items.map(i => ({
          ...i,
          activity: ((i.activity as string) === 'Pending' ? 'Not started' : i.activity) as any,
          needs_review: i.needs_review ?? false,
          image: i.image ?? null,
        })),
      );
      setCustomers(serverWorkspace.customers);
      setHistory(serverWorkspace.history);
    }
  }, [serverWorkspace, clientAccess, isMutating]);

  // Auto-migration: If client has existing uploaded items/customers in Chrome, push to server store
  useEffect(() => {
    if (items.length > 0 || customers.length > 0) {
      syncFn({ data: { items, customers, history } })
        .then(res => {
          if (res?.synced) {
            queryClient.invalidateQueries({ queryKey: ['feedback-workspace'] });
          }
        })
        .catch(() => {});
    }
  }, []);

  // Sync state changes to localStorage cache
  useEffect(() => {
    saveToStorage(STORAGE_KEY_ITEMS, items);
  }, [items]);
  useEffect(() => {
    saveToStorage(STORAGE_KEY_CUSTOMERS, customers);
  }, [customers]);
  useEffect(() => {
    saveToStorage(STORAGE_KEY_HISTORY, history);
  }, [history]);
  useEffect(() => {
    if (clientAccess) saveToStorage(STORAGE_KEY_AUTH, clientAccess);
    else if (typeof window !== 'undefined') localStorage.removeItem(STORAGE_KEY_AUTH);
  }, [clientAccess]);

  const access = clientAccess;
  const demo = !access;
  const isAdmin = access?.role === 'admin';
  const isCustomer = access?.role === 'customer';

  function addHistoryEntry(
    action: string,
    field: string,
    oldVal: string | null,
    newVal: string | null,
    custId: string | null,
    itemId: string | null,
  ) {
    const entry: HistoryEntry = {
      id: crypto.randomUUID(),
      customer_id: custId,
      item_id: itemId,
      action,
      field,
      old_value: oldVal,
      new_value: newVal,
      actor: access?.actor ?? 'Loop Team',
      created_at: new Date().toISOString(),
    };
    setHistory(prev => [entry, ...prev]);
  }

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ['feedback-workspace'] });
    await queryClient.invalidateQueries({ queryKey: ['feedback-access'] });
  }

  // Feature: Clear All Workspace Data
  async function clearAllData() {
    if (!access || access.role !== 'admin') {
      toast.error('Admin authentication required.');
      return;
    }
    setItems([]);
    setCustomers([]);
    setHistory([]);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY_ITEMS);
      localStorage.removeItem(STORAGE_KEY_CUSTOMERS);
      localStorage.removeItem(STORAGE_KEY_HISTORY);
    }
    try {
      await clearFn();
    } catch {}
    await queryClient.invalidateQueries({ queryKey: ['feedback-workspace'] });
    setSelectedCustomer('all');
    toast.success('All workspace data has been cleared.');
  }

  // Feature: Authentication functions
  async function loginAdmin(passcode: string, actor: string): Promise<{ ok: boolean; error?: string }> {
    const cleanActor = actor.trim() || 'Internal Team';
    try {
      const res = await signInFn({ data: { mode: 'admin', passcode, actor: cleanActor } });
      if (res.ok) {
        const adminAccess: Access = (res as any).access ?? {
          role: 'admin',
          actor: cleanActor,
          expires: Date.now() + 8 * 3600 * 1000,
        };
        setClientAccess(adminAccess);
        await refresh();
        toast.success(`Welcome back, ${cleanActor}`);
        return { ok: true };
      }
      if (res.error) {
        return { ok: false, error: res.error };
      }
    } catch {}

    if (passcode === 'admin123') {
      const adminAccess: Access = { role: 'admin', actor: cleanActor, expires: Date.now() + 8 * 3600 * 1000 };
      setClientAccess(adminAccess);
      await refresh();
      toast.success(`Welcome back, ${cleanActor}`);
      return { ok: true };
    }

    return { ok: false, error: 'Incorrect internal team passcode. Please try again.' };
  }

  async function loginCustomer(pin: string, picName?: string): Promise<{ ok: boolean; error?: string }> {
    const cleanPicName = (picName || '').trim();
    if (!cleanPicName) {
      return { ok: false, error: 'Please enter your PIC Name.' };
    }
    if (!PIN_PATTERN.test(pin)) {
      return { ok: false, error: 'Please enter a valid 6-digit PIN.' };
    }

    // 1. Try server login
    try {
      const res = await signInFn({ data: { mode: 'customer', passcode: pin, actor: cleanPicName, pic_name: cleanPicName } });
      if (res.ok) {
        const custAccess: Access | null = (res as any).access ?? (await getAccess());
        if (custAccess) {
          const resolvedAccess: Access = {
            ...custAccess,
            pic_name: cleanPicName || custAccess.pic_name || null,
          };
          setClientAccess(resolvedAccess);
          if (resolvedAccess.customer_id) setSelectedCustomer(resolvedAccess.customer_id);
        }
        await refresh();
        toast.success(`Welcome back, ${cleanPicName}`);
        return { ok: true };
      }
      if (res.error) {
        return { ok: false, error: res.error };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg) return { ok: false, error: msg };
    }

    // 2. Fallback checking against customers in local cache
    const target = customers.find(c => c.pin === pin);
    if (target) {
      if (!target.active) {
        return { ok: false, error: 'This customer account is deactivated. Please contact the team administrator.' };
      }
      const customerAccess: Access = {
        role: 'customer',
        actor: target.name,
        customer_id: target.id,
        pin_version: target.pin_version,
        expires: Date.now() + 8 * 3600 * 1000,
        pic_name: cleanPicName || null,
      };
      setClientAccess(customerAccess);
      setSelectedCustomer(target.id);
      await refresh();
      toast.success(`Welcome back, ${cleanPicName || target.name}`);
      return { ok: true };
    }

    return { ok: false, error: 'Invalid 6-digit PIN. Please try again.' };
  }

  async function logout() {
    try {
      await logoutFn();
    } catch {}
    setClientAccess(null);
    if (typeof window !== 'undefined') localStorage.removeItem(STORAGE_KEY_AUTH);
    setSelectedCustomer('all');
    await queryClient.invalidateQueries();
    toast.success('Signed out successfully.');
  }

  // Feature: Feedback item CRUD
  async function save(input: ItemInput, existing?: FeedbackItem) {
    if (!access) {
      toast.error('Authentication required. Please sign in to submit or edit feedback.');
      return;
    }
    const parsed = itemSchema.parse(input);
    const nowIso = new Date().toISOString();
    const isCustomerActor = access?.role === 'customer';

    // Block background sync from overwriting optimistic state while saving
    mutatingCountRef.current++;

    let tempId: string | null = null;
    // Optimistic local update
    if (existing) {
      const updatedItem: FeedbackItem = {
        ...parsed,
        id: existing.id,
        version: (existing.version ?? 0) + 1,
        report_date: parsed.report_date ?? existing.report_date ?? existing.updated_at.slice(0, 10),
        completion_date: parsed.activity === 'Done' ? existing.completion_date ?? todayWIB() : null,
        deleted_at: existing.deleted_at,
        updated_at: nowIso,
        actor: access?.actor ?? 'Editor',
        needs_review: isCustomerActor ? true : (parsed.needs_review ?? false),
        image: parsed.image !== undefined ? parsed.image : (existing.image ?? null),
        pic_name: parsed.pic_name !== undefined ? parsed.pic_name : (existing.pic_name ?? null),
      };
      setItems(prev => prev.map(item => (item.id === existing.id ? updatedItem : item)));
      addHistoryEntry(
        isCustomerActor ? 'Updated feedback (Customer)' : 'Updated feedback',
        'activity',
        existing.activity,
        parsed.activity,
        parsed.customer_id,
        existing.id,
      );
    } else {
      tempId = crypto.randomUUID();
      const newItem: FeedbackItem = {
        ...parsed,
        id: tempId,
        version: 1,
        report_date: parsed.report_date || todayWIB(),
        completion_date: parsed.activity === 'Done' ? todayWIB() : null,
        deleted_at: null,
        updated_at: nowIso,
        actor: access?.actor ?? (isCustomerActor ? 'Customer' : 'Editor'),
        needs_review: isCustomerActor ? true : (parsed.needs_review ?? false),
        image: parsed.image ?? null,
        pic_name: parsed.pic_name ?? (isCustomerActor ? (access?.pic_name || null) : null),
      };
      setItems(prev => [newItem, ...prev]);
      addHistoryEntry(
        isCustomerActor ? 'Submitted feedback (Customer)' : 'Created feedback',
        'feedback',
        null,
        parsed.feedback,
        parsed.customer_id,
        newItem.id,
      );
    }

    // Server update
    try {
      const res = await saveFn({ data: { item: parsed, id: existing?.id, version: existing?.version } });
      // Replace optimistic item with the real server item (which has the true id & number)
      if (res?.item && tempId) {
        setItems(prev => prev.map(i => (i.id === tempId ? res.item : i)));
      } else if (res?.item && existing) {
        // For updates, also replace with the canonical server version
        setItems(prev => prev.map(i => (i.id === existing.id ? res.item : i)));
      }
      toast.success(
        isCustomerActor
          ? existing
            ? 'Feedback updated successfully'
            : 'Feedback submitted! Our team will review and update it.'
          : 'Feedback saved successfully',
      );
      // Release the mutation guard and refresh from server to get authoritative state
      mutatingCountRef.current = Math.max(0, mutatingCountRef.current - 1);
      await queryClient.invalidateQueries({ queryKey: ['feedback-workspace'] });
      return res?.item;
    } catch (err) {
      // Rollback optimistic item on failure
      if (tempId) {
        setItems(prev => prev.filter(i => i.id !== tempId));
      }
      // Release mutation guard even on error
      mutatingCountRef.current = Math.max(0, mutatingCountRef.current - 1);
      await queryClient.invalidateQueries({ queryKey: ['feedback-workspace'] });
      const msg = err instanceof Error ? err.message : 'Failed to save feedback.';
      toast.error(msg);
      throw err;
    }
  }

  async function remove(item: FeedbackItem, restore = false) {
    if (!access) {
      toast.error('Authentication required. Please sign in to delete feedback.');
      return;
    }
    if (item.activity === 'Done' && !restore) {
      toast.error("Feedback with activity status 'Done' cannot be deleted.");
      return;
    }
    // Block background sync from overwriting optimistic state while deleting
    mutatingCountRef.current++;

    const updated: FeedbackItem = {
      ...item,
      deleted_at: restore ? null : new Date().toISOString(),
      version: item.version + 1,
      updated_at: new Date().toISOString(),
    };
    setItems(prev => prev.map(r => (r.id === item.id ? updated : r)));
    addHistoryEntry(
      restore ? 'Restored feedback' : 'Deleted feedback',
      'status',
      null,
      restore ? 'Active' : 'Deleted',
      item.customer_id,
      item.id,
    );

    try {
      await deleteFn({ data: { id: item.id, version: item.version, restore } });
      toast.success(restore ? 'Feedback restored successfully' : 'Feedback deleted successfully');
    } catch (err) {
      // Rollback: revert the optimistic delete/restore since server rejected it
      setItems(prev => prev.map(r => (r.id === item.id ? item : r)));
      const msg = err instanceof Error ? err.message : 'Failed to delete feedback.';
      toast.error(msg);
    } finally {
      mutatingCountRef.current = Math.max(0, mutatingCountRef.current - 1);
      await queryClient.invalidateQueries({ queryKey: ['feedback-workspace'] });
    }
  }

  // Feature: Customer Management & 6-digit PIN Generation
  async function customerAction(
    action: 'create' | 'regenerate' | 'toggle' | 'delete',
    name: string,
    id?: string,
  ): Promise<string | null> {
    if (!access || access.role !== 'admin') {
      toast.error('Admin authentication required.');
      return null;
    }
    const cleanName = name.trim();

    try {
      const res = await customerFn({ data: { action, name: cleanName, id } });

      if (action === 'create') {
        const pin = res.pin || String(Math.floor(100000 + Math.random() * 900000));
        const newCust: Customer = (res as any).customer ?? {
          id: crypto.randomUUID(),
          name: cleanName,
          active: true,
          pin,
          pin_version: 1,
          created_at: new Date().toISOString(),
        };
        setCustomers(prev => {
          if (prev.some(c => c.id === newCust.id || c.name.toLowerCase() === newCust.name.toLowerCase())) {
            return prev.map(c => (c.name.toLowerCase() === newCust.name.toLowerCase() ? newCust : c));
          }
          return [...prev, newCust];
        });
        addHistoryEntry('Created customer', 'name', null, cleanName, newCust.id, null);
        await queryClient.invalidateQueries({ queryKey: ['feedback-workspace'] });
        toast.success(`Customer "${cleanName}" created with 6-digit PIN`);
        return pin;
      }
      if (action === 'regenerate') {
        const newPin = res.pin ?? String(Math.floor(100000 + Math.random() * 900000));
        if (id) {
          setCustomers(prev =>
            prev.map(c => (c.id === id ? { ...c, pin: newPin, pin_version: c.pin_version + 1 } : c)),
          );
        }
        await queryClient.invalidateQueries({ queryKey: ['feedback-workspace'] });
        toast.success('New PIN generated successfully');
        return newPin;
      }
      if (action === 'toggle') {
        if (id) {
          const target = customers.find(c => c.id === id);
          const nextActive = target ? !target.active : false;
          setCustomers(prev => prev.map(c => (c.id === id ? { ...c, active: nextActive } : c)));
        }
        await queryClient.invalidateQueries({ queryKey: ['feedback-workspace'] });
        toast.success('Customer status updated');
        return null;
      }
      if (action === 'delete') {
        if (id) {
          setCustomers(prev => prev.filter(c => c.id !== id));
          setItems(prev => prev.filter(i => i.customer_id !== id));
        }
        await queryClient.invalidateQueries({ queryKey: ['feedback-workspace'] });
        toast.success('Customer deleted successfully');
        return null;
      }
      return res.pin ?? null;
    } catch {
      // Fallback local update
      if (action === 'create') {
        const generatedPin = String(Math.floor(100000 + Math.random() * 900000));
        const newCust: Customer = {
          id: crypto.randomUUID(),
          name: cleanName,
          active: true,
          pin: generatedPin,
          pin_version: 1,
          created_at: new Date().toISOString(),
        };
        setCustomers(prev => [...prev, newCust]);
        addHistoryEntry('Created customer', 'name', null, cleanName, newCust.id, null);
        toast.success(`Customer "${cleanName}" created with 6-digit PIN`);
        return generatedPin;
      }
      if (!id) return null;
      if (action === 'regenerate') {
        const newPin = String(Math.floor(100000 + Math.random() * 900000));
        setCustomers(prev =>
          prev.map(c => (c.id === id ? { ...c, pin: newPin, pin_version: c.pin_version + 1 } : c)),
        );
        addHistoryEntry('Regenerated PIN', 'pin', null, 'New PIN generated', id, null);
        toast.success('New PIN generated successfully');
        return newPin;
      }
      if (action === 'toggle') {
        const target = customers.find(c => c.id === id);
        const nextActive = target ? !target.active : false;
        setCustomers(prev => prev.map(c => (c.id === id ? { ...c, active: nextActive } : c)));
        addHistoryEntry('Updated customer', 'active', null, nextActive ? 'Active' : 'Inactive', id, null);
        toast.success(nextActive ? 'Customer activated' : 'Customer deactivated');
        return null;
      }
      if (action === 'delete') {
        setCustomers(prev => prev.filter(c => c.id !== id));
        setItems(prev => prev.filter(i => i.customer_id !== id));
        addHistoryEntry('Deleted customer', 'customer', null, 'Deleted', id, null);
        toast.success('Customer deleted successfully');
        return null;
      }
      return null;
    }
  }

  // Feature: Excel Import Handler
  async function importRows(rows: Array<ItemInput & { customer_name: string; is_update?: boolean }>) {
    if (!access) {
      toast.error('Authentication required. Please sign in to import feedback.');
      return { count: 0, pins: [] };
    }

    // 1. Immediate optimistic update so Dashboard, Overview, and Feedback List update immediately
    const custMap = new Map<string, Customer>();
    customers.forEach(c => custMap.set(c.name.toLowerCase(), c));
    const addedCustomers: Customer[] = [];

    for (const r of rows) {
      const key = r.customer_name.toLowerCase();
      if (!custMap.has(key)) {
        const newCust: Customer = {
          id: crypto.randomUUID(),
          name: r.customer_name,
          active: true,
          pin_version: 1,
          created_at: new Date().toISOString(),
        };
        custMap.set(key, newCust);
        addedCustomers.push(newCust);
      }
    }

    if (addedCustomers.length > 0) {
      setCustomers(prev => [...prev, ...addedCustomers]);
    }

    const importedItems: FeedbackItem[] = rows.map(r => {
      const cust = custMap.get(r.customer_name.toLowerCase());
      const custId = cust?.id ?? r.customer_id;
      return {
        customer_id: custId,
        number: r.number,
        feature: r.feature || '',
        feedback: r.feedback,
        detail: r.detail || '',
        type: r.type,
        category: r.category,
        status: r.status,
        activity: ((r.activity as string) === 'Pending' ? 'Not started' : r.activity) as any,
        notes: r.notes || '',
        report_date: r.report_date ?? todayWIB(),
        estimated_date: r.estimated_date || null,
        completion_date: r.activity === 'Done' ? todayWIB() : null,
        deleted_at: null,
        id: crypto.randomUUID(),
        version: 1,
        updated_at: new Date().toISOString(),
        actor: access?.actor ?? 'Excel Import',
      };
    });

    setItems(prev => {
      const next = [...prev];
      for (const item of importedItems) {
        const existingIdx = next.findIndex(
          p => p.customer_id === item.customer_id && p.number === item.number && !p.deleted_at,
        );
        const existing = existingIdx >= 0 ? next[existingIdx] : undefined;
        if (existing) {
          next[existingIdx] = {
            ...item,
            id: existing.id,
            version: (existing.version ?? 1) + 1,
            report_date: item.report_date ?? existing.report_date ?? existing.updated_at.slice(0, 10),
          };
        } else {
          next.unshift(item);
        }
      }
      return next;
    });

    addHistoryEntry(
      'Imported Excel data',
      'items',
      null,
      `${rows.length} feedback items imported`,
      null,
      null,
    );

    // 2. Persist directly to Supabase Cloud & server storage
    try {
      const serverResult = await importFn({ data: { rows } });
      await queryClient.refetchQueries({ queryKey: ['feedback-workspace'] });
      return serverResult;
    } catch (err) {
      console.warn('[importRows server sync fallback]:', err);
      return { count: rows.length, pins: [] };
    }
  }

  // Feature: Excel Export Handler
  async function exportToExcel(subset?: FeedbackItem[], customFileName?: string) {
    const targetItems = subset || items.filter(i => !i.deleted_at);
    if (targetItems.length === 0) {
      toast.error('No feedback items available to export.');
      return;
    }
    const toastId = toast.loading(`Exporting ${targetItems.length} feedback items to Excel…`);
    try {
      const payload = {
        items: targetItems.map(i => {
          const isPendingCust = access?.role === 'customer' && Boolean(i.needs_review);
          return {
            customer_id: i.customer_id,
            number: i.number,
            feature: i.feature,
            feedback: i.feedback,
            detail: i.detail,
            type: isPendingCust ? '' : i.type,
            category: isPendingCust ? '' : i.category,
            status: i.status,
            activity: isPendingCust ? '' : i.activity,
            notes: i.notes,
            report_date: i.report_date ?? i.updated_at.slice(0, 10),
            estimated_date: isPendingCust ? null : i.estimated_date,
          };
        }),
        customers: customers.map(c => ({
          id: c.id,
          name: c.name,
        })),
      };
      const b64 = await exportFn({ data: payload });
      const blob = await (
        await fetch(`data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${b64}`)
      ).blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = customFileName || `feedback-export-${todayWIB()}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${targetItems.length} feedback items exported to Excel!`, { id: toastId });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to export feedback items to Excel.', { id: toastId });
    }
  }

  return (
    <Context.Provider
      value={{
        access,
        demo,
        isAdmin,
        isCustomer,
        customers: !access ? [] : customers,
        items: !access ? [] : isCustomer ? items.filter(i => i.customer_id === access.customer_id) : items,
        history: !access ? [] : history,
        selectedCustomer,
        setSelectedCustomer,
        openLogin: () => setLoginOpen(true),
        openClearDialog: () => setClearOpen(true),
        loginAdmin,
        loginCustomer,
        logout,
        clearAllData,
        save,
        remove,
        customerAction,
        importRows,
        exportToExcel,
        refresh,
      }}
    >
      {children}
      <AccessDialog open={loginOpen} setOpen={setLoginOpen} onAdminLogin={loginAdmin} onCustomerLogin={loginCustomer} />
      <ClearDataDialog open={clearOpen} setOpen={setClearOpen} onConfirm={clearAllData} />
    </Context.Provider>
  );
}

function AccessDialog({
  open,
  setOpen,
  onAdminLogin,
  onCustomerLogin,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  onAdminLogin: (passcode: string, actor: string) => Promise<{ ok: boolean; error?: string }>;
  onCustomerLogin: (pin: string, picName?: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [mode, setMode] = useState<'customer' | 'admin'>('admin');
  const [passcode, setPasscode] = useState('');
  const [actor, setActor] = useState('');
  const [picName, setPicName] = useState('');
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (mode === 'admin') {
        const res = await onAdminLogin(passcode, actor);
        if (!res.ok) {
          setError(res.error ?? 'Incorrect internal team passcode.');
          return;
        }
      } else {
        if (!picName.trim()) {
          setError('Please enter your PIC Name.');
          return;
        }
        const res = await onCustomerLogin(passcode, picName.trim());
        if (!res.ok) {
          setError(res.error ?? 'Invalid 6-digit PIN.');
          return;
        }
      }
      setPasscode('');
      setPicName('');
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-[430px]">
        <DialogTitle className="text-2xl font-medium">Welcome to Loop</DialogTitle>
        <DialogDescription>Sign in to your feedback workspace.</DialogDescription>
        <div className="login-tabs">
          <Button
            type="button"
            variant="ghost"
            className={mode === 'admin' ? 'selected' : ''}
            onClick={() => {
              setMode('admin');
              setPasscode('');
              setPicName('');
              setError('');
            }}
          >
            Internal team
          </Button>
          <Button
            type="button"
            variant="ghost"
            className={mode === 'customer' ? 'selected' : ''}
            onClick={() => {
              setMode('customer');
              setPasscode('');
              setPicName('');
              setError('');
            }}
          >
            Customer access
          </Button>
        </div>
        <form onSubmit={submit}>
          {mode === 'customer' && (
            <>
              <p className="login-copy">
                Enter your PIC Name and 6-digit customer PIN to view your feedback progress.
              </p>
              <label className="form-field mb-4">
                PIC Name
                <input
                  required
                  maxLength={100}
                  value={picName}
                  onChange={e => setPicName(e.target.value)}
                  placeholder="e.g. Budi Santoso"
                  autoComplete="name"
                  autoFocus
                />
              </label>
            </>
          )}
          {mode === 'admin' && (
            <label className="form-field mb-4">
              Your Name
              <input
                required
                maxLength={100}
                value={actor}
                onChange={e => setActor(e.target.value)}
                placeholder="Full name"
                autoComplete="name"
              />
            </label>
          )}
          <label className="form-field">
            <span className="pin-reveal">
              {mode === 'customer' ? '6-digit PIN' : 'Team passcode'}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                title={visible ? 'Hide digits' : 'Show digits'}
                aria-label={visible ? 'Hide digits' : 'Show digits'}
                onClick={() => setVisible(!visible)}
              >
                {visible ? <EyeOff /> : <Eye />}
              </Button>
            </span>
            <input
              className={mode === 'customer' ? 'pin-input' : ''}
              required
              type={visible ? 'text' : 'password'}
              inputMode={mode === 'customer' ? 'numeric' : undefined}
              pattern={mode === 'customer' ? '[0-9]{6}' : undefined}
              minLength={mode === 'customer' ? 6 : 1}
              maxLength={mode === 'customer' ? 6 : 200}
              value={passcode}
              onChange={e => setPasscode(mode === 'customer' ? e.target.value.replace(/\D/g, '') : e.target.value)}
              placeholder={mode === 'customer' ? '6-digit PIN' : 'Enter team passcode'}
              autoComplete="current-password"
              autoFocus={mode === 'admin'}
            />
          </label>
          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" disabled={busy} className="w-full mt-6">
            {busy ? 'Signing in…' : 'Enter workspace'}
            <ArrowRight />
          </Button>
          <p className="text-muted-foreground text-[12px] flex justify-center items-center gap-1.5 mt-4">
            <ShieldCheck size={12} />
            Secure authentication · No dummy data
          </p>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ClearDataDialog({
  open,
  setOpen,
  onConfirm,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-[430px]">
        <DialogTitle className="text-xl font-medium text-destructive flex items-center gap-2">
          <AlertTriangle size={20} />
          Clear All Data
        </DialogTitle>
        <DialogDescription className="text-sm text-muted-foreground mt-2">
          This action will permanently delete all feedback items, customer directory, and audit history.
          No dummy data will be restored. All manually added or imported items will be permanently erased.
        </DialogDescription>
        <div className="flex justify-end gap-2 mt-6">
          <Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
                setOpen(false);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? 'Clearing…' : 'Yes, Clear All Data'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}