import { useState } from "react";
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
import { PlusCircle, Trash2, Pencil, Check, X, ShieldCheck, Eye, EyeOff, ToggleLeft, ToggleRight } from "lucide-react";

interface Restaurant {
  id: number;
  name: string;
  active: boolean;
  createdAt: string;
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
    mutationFn: async ({ id, name, password }: { id: number; name: string; password: string }) => {
      const body: any = { name };
      if (password) body.password = password;
      const res = await apiRequest("PATCH", `/api/admin/restaurants/${id}`, body);
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/restaurants"] });
      setEditingId(null);
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

  function startEdit(r: Restaurant) {
    setEditingId(r.id);
    setEditName(r.name);
    setEditPassword("");
    setShowEditPw(false);
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
        <div className="px-5 py-3 border-b border-border">
          <h2 className="text-sm font-semibold">Restaurants ({restaurants.length})</h2>
        </div>

        {isLoading ? (
          <div className="px-5 py-6 text-sm text-muted-foreground">Loading…</div>
        ) : restaurants.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground">
            No restaurants yet — add one above.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {restaurants.map((r) => (
              <li key={r.id} className="px-5 py-4">
                {editingId === r.id ? (
                  /* Edit mode */
                  <div className="flex gap-2 flex-wrap items-center">
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
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
                      <button
                        type="button"
                        onClick={() => setShowEditPw((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                        tabIndex={-1}
                      >
                        {showEditPw ? <EyeOff size={12} /> : <Eye size={12} />}
                      </button>
                    </div>
                    <Button
                      size="sm"
                      className="h-8 gap-1"
                      onClick={() => updateMutation.mutate({ id: r.id, name: editName, password: editPassword })}
                      disabled={!editName.trim() || updateMutation.isPending}
                    >
                      <Check size={12} /> Save
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditingId(null)}>
                      <X size={12} />
                    </Button>
                  </div>
                ) : (
                  /* View mode */
                  <div className="flex items-center gap-3">
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
