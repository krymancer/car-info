import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { useSyncExternalStore } from "react";
import { api, type Entry, type Reminder, type Vehicle } from "./api";

export const useVehicles = () =>
  useQuery({ queryKey: ["vehicles"], queryFn: () => api<Vehicle[]>("/vehicles") });

export const useEntries = (vehicleId?: string) =>
  useQuery({
    queryKey: ["entries", vehicleId],
    queryFn: () => api<Entry[]>(`/entries?vehicle_id=${vehicleId}`),
    enabled: !!vehicleId,
  });

export const useReminders = (vehicleId?: string) =>
  useQuery({
    queryKey: ["reminders", vehicleId],
    queryFn: () => api<Reminder[]>(`/reminders?vehicle_id=${vehicleId}`),
    enabled: !!vehicleId,
  });

// Selected vehicle is remembered per device.
const KEY = "car-info-vehicle";
const listeners = new Set<() => void>();
export function selectVehicle(id: string) {
  localStorage.setItem(KEY, id);
  listeners.forEach((l) => l());
}

/** The active vehicle: the stored choice if it still exists, else the first non-archived one. */
export function useCurrentVehicle() {
  const stored = useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => localStorage.getItem(KEY),
  );
  const vehicles = useVehicles();
  const list = vehicles.data ?? [];
  const vehicle = list.find((v) => v.id === stored) ?? list.find((v) => !v.archived) ?? list[0];
  return { vehicle, vehicles: list, isLoading: vehicles.isLoading };
}

export const useAllEntries = () =>
  useQuery({ queryKey: ["entries", "all"], queryFn: () => api<Entry[]>("/entries") });

/** Back, or to the log when this page was opened directly (no in-app history to go back to). */
export function useGoBack() {
  const navigate = useNavigate();
  return () => ((window.history.state?.idx ?? 0) > 0 ? navigate(-1) : navigate("/", { replace: true }));
}
