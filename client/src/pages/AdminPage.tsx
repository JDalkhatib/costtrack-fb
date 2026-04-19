import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { PlusCircle, Trash2, Pencil, Check, X, ShieldCheck, Eye, EyeOff, ToggleLeft, ToggleRight, GripVertical } from "lucide-react";

interface Restaurant {
  id: number;
  name: string;
  active: boolean;
  createdAt: string;
  sortOrder: number;
  gmailUser?: string | null;
  gmailAppPassword?: string | null;
}

export default function AdminPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // New restaurant form
  const [newName, setNewName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showNewPw, setShowNewPw] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [showEditPw, setShowEditPw] = useState(false);
  const [editGmailUser, setEditGmailUser] = useState("");
  const [editGmailPass, setEditGmailPass] = useState("");
  const [showEditGmailPw, setShowEditGmailPw] = useState(false);

  // Drag state
  const dragItem = useRef<number | null>(null);   // index being dragged
  const dragOver = useRef<number | null>(null);   // index being hovered
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const { data: restaurants = [], isLoading } = useQuery<Restaurant[]>({
    queryKey: ["/api/admin/restaurants"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/restaurants");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async ({ name, password }: { name: string; password: string }) => {
      const res = await apiRequest("POST", "/api/admin/restaurants", { name, password });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/restaurants"] });
      setNewName("");
      setNewPassword("");
      toast({ title: "Restaurant created" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, name, password, gmailUser, gmailAppPassword }: { id: number; name: string; password: string; gmailUser: string; gmailAppPassword: string }) => {
      const body: any = { name };
      if (password) body.password = password;
      body.gmailUser = gmailUser || null;
      body.gmailAppPassword = gmailAppPassword || null;
      const res = await apiRequest("PATCH", `/api/admin/restaurants/${id}`, body);
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/restaurants"] });
      setEditingId(null);
      setEditGmailUser("");
      setEditGmailPass("");
      toast({ title: "Restaurant updated" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, active }: { id: number; active: boolean }) => {
      const res = await apiRequest("PATCH", `/api/admin/restaurants/${id}`, { active });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/restaurants"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/admin/restaurants/${id}`);
      if (!res.ok) throw new Error("Delete failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/restaurants"] });
      toast({ title: "Restaurant deleted" });
    },
  });

  const reorderMutation = useMutation({
    mutationFn: async (orderedIds: number[]) => {
      const res = await apiRequest("PUT", "/api/admin/restaurants/reorder", { orderedIds });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/restaurants"] });
    },
    onError: (err: any) => toast({ title: "Reorder failed", description: err.message, variant: "destructive" }),
  });

  function startEdit(r: Restaurant) {
    setEditingId(r.id);
    setEditName(r.name);
    setEditPassword("");
    setShowEditPw(false);
    setEditGmailUser(r.gmailUser ?? "");
    setEditGmailPass(""); // never prefill password
    setShowEditGmailPw(false);
  }

  // ── Drag handlers ──────────────────────────────────────────
  function handleDragStart(e: React.DragEvent, index: number) {
    dragItem.current = index;
    setDragIndex(index);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragEnter(index: number) {
    dragOver.current = index;
    setDropIndex(index);
  }

  function handleDragEnd() {
    const from = dragItem.current;
    const to = dragOver.current;
    setDragIndex(null);
    setDropIndex(null);
    dragItem.current = null;
    dragOver.current = null;

    if (from === null || to === null || from === to) return;

    // Reorder locally
    const reordered = [...restaurants];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);

    // Optimistic update
    queryClient.setQueryData(["/api/admin/restaurants"], reordered);

    // Persist to server
    reorderMutation.mutate(reordered.map((r) => r.id));
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-2 mb-6">
        <ShieldCheck size={20} className="text-primary" />
        <h1 className="text-xl font-semibold">Admin Panel</h1>
      </div>

      {/* Add new restaurant */}
      <div className="bg-card border border-border rounded-xl p-5 mb-6">
        <h2 className="text-sm font-semibold mb-3">Add Restaurant</h2>
        <div className="flex gap-2 flex-wrap">
          <Input
            placeholder="Restaurant name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="flex-1 min-w-36"
          />
          <div className="relative flex-1 min-w-36">
            <Input
              type={showNewPw ? "text" : "password"}
              placeholder="Password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="pr-9"
            />
            <button
              type="button"
              onClick={() => setShowNewPw((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              tabIndex={-1}
            >
              {showNewPw ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <Button
            onClick={() => createMutation.mutate({ name: newName, password: newPassword })}
            disabled={!newName.trim() || !newPassword.trim() || createMutation.isPending}
            className="gap-1.5 shrink-0"
          >
            <PlusCircle size={14} /> Add
          </Button>
        </div>
      </div>

      {/* Restaurant list */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-semibold">Restaurants ({restaurants.length})</h2>
          {restaurants.length > 1 && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <GripVertical size={12} /> Drag to reorder
            </p>
          )}
        </div>

        {isLoading ? (
          <div className="px-5 py-6 text-sm text-muted-foreground">Loading…</div>
        ) : restaurants.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground">
            No restaurants yet — add one above.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {restaurants.map((r, index) => (
              <li
                key={r.id}
                draggable={editingId !== r.id}
                onDragStart={(e) => handleDragStart(e, index)}
                onDragEnter={() => handleDragEnter(index)}
                onDragOver={(e) => e.preventDefault()}
                onDragEnd={handleDragEnd}
                className={[
                  "px-5 py-4 transition-colors",
                  dragIndex === index ? "opacity-40" : "",
                  dropIndex === index && dragIndex !== index
                    ? "bg-accent/60 border-l-2 border-primary"
                    : "",
                ].join(" ")}
              >
                {editingId === r.id ? (
                  /* Edit mode */
                  <div className="space-y-2">
                    <div className="flex gap-2 flex-wrap items-center">
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="Restaurant name"
                        className="flex-1 min-w-32 h-8 text-sm"
                      />
                      <div className="relative flex-1 min-w-32">
                        <Input
                          type={showEditPw ? "text" : "password"}
                          placeholder="New password (optional)"
                          value={editPassword}
                          onChange={(e) => setEditPassword(e.target.value)}
                          className="pr-9 h-8 text-sm"
                        />
                        <button type="button" onClick={() => setShowEditPw((v) => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" tabIndex={-1}>
                          {showEditPw ? <EyeOff size={12} /> : <Eye size={12} />}
                        </button>
                      </div>
                    </div>
                    {/* Email inbox fields */}
                    <div className="flex gap-2 flex-wrap items-center">
                      <Input
                        value={editGmailUser}
                        onChange={(e) => setEditGmailUser(e.target.value)}
                        placeholder="Invoice email (e.g. location@gmail.com)"
                        className="flex-1 min-w-40 h-8 text-sm"
                        type="email"
                      />
                      <div className="relative flex-1 min-w-32">
                        <Input
                          type={showEditGmailPw ? "text" : "password"}
                          placeholder={editGmailUser ? "Gmail App Password" : "App password"}
                          value={editGmailPass}
                          onChange={(e) => setEditGmailPass(e.target.value)}
                          className="pr-9 h-8 text-sm"
                        />
                        <button type="button" onClick={() => setShowEditGmailPw((v) => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" tabIndex={-1}>
                          {showEditGmailPw ? <EyeOff size={12} /> : <Eye size={12} />}
                        </button>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" className="h-8 gap-1"
                        onClick={() => updateMutation.mutate({ id: r.id, name: editName, password: editPassword, gmailUser: editGmailUser, gmailAppPassword: editGmailPass })}
                        disabled={!editName.trim() || updateMutation.isPending}>
                        <Check size={12} /> Save
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditingId(null)}>
                        <X size={12} /> Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  /* View mode */
                  <div className="flex items-center gap-3">
                    {/* Drag handle */}
                    <div
                      className="text-muted-foreground/40 hover:text-muted-foreground cursor-grab active:cursor-grabbing shrink-0"
                      title="Drag to reorder"
                    >
                      <GripVertical size={15} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <span className={`text-sm font-medium ${!r.active ? "text-muted-foreground line-through" : ""}`}>
                        {r.name}
                      </span>
                      {!r.active && (
                        <span className="ml-2 text-xs text-muted-foreground">(inactive)</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {/* Toggle active */}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        title={r.active ? "Deactivate" : "Activate"}
                        onClick={() => toggleActiveMutation.mutate({ id: r.id, active: !r.active })}
                      >
                        {r.active ? <ToggleRight size={15} className="text-primary" /> : <ToggleLeft size={15} />}
                      </Button>
                      {/* Edit */}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        onClick={() => startEdit(r)}
                      >
                        <Pencil size={13} />
                      </Button>
                      {/* Delete */}
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive">
                            <Trash2 size={13} />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete {r.name}?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will permanently delete the restaurant. Invoices may be affected.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              onClick={() => deleteMutation.mutate(r.id)}
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
