import {
  BatteryCharging,
  Car,
  CircleDot,
  CircleParking,
  Cog,
  Disc3,
  Droplet,
  Droplets,
  FileText,
  Filter,
  Fuel,
  Gauge,
  HardHat,
  Landmark,
  Lightbulb,
  Link2,
  type LucideIcon,
  Music,
  Paintbrush,
  ReceiptText,
  Settings2,
  ShieldCheck,
  ShowerHead,
  Siren,
  Snowflake,
  Sofa,
  Sparkles,
  Thermometer,
  Truck,
  Wind,
  Wrench,
  Zap,
} from "lucide-react";
import type { Kind } from "./api";

export type KindInfo = { label: string; plural: string; icon: LucideIcon; color: string };

// Chart colors: categorical slots 1-4 validated for the dark surface (fixed order, never cycled).
export const KINDS: Record<Kind, KindInfo> = {
  service: { label: "Maintenance", plural: "Maintenance", icon: Wrench, color: "#3987e5" },
  upgrade: { label: "Upgrade", plural: "Upgrades", icon: Sparkles, color: "#d95926" },
  expense: { label: "Expense", plural: "Expenses", icon: ReceiptText, color: "#199e70" },
  fuel: { label: "Fuel", plural: "Fuel", icon: Fuel, color: "#c98500" },
};
export const KIND_ORDER: Kind[] = ["service", "upgrade", "expense", "fuel"];

export const KIND_HINT: Record<Kind, string> = {
  service: "Repairs, oil changes, parts swapped",
  upgrade: "Mods, accessories, improvements",
  expense: "Taxes, insurance, fines, parking, wash",
  fuel: "Fill-ups and fuel economy",
};

export type Category = { id: string; label: string; icon: LucideIcon };

export const CATEGORIES: Record<Exclude<Kind, "fuel">, Category[]> = {
  service: [
    { id: "preventive", label: "Preventive maintenance", icon: HardHat },
    { id: "oil", label: "Oil & filter", icon: Droplet },
    { id: "air_filter", label: "Engine air filter", icon: Wind },
    { id: "cabin_filter", label: "Cabin filter", icon: Snowflake },
    { id: "brake_pads", label: "Brake pads", icon: Disc3 },
    { id: "brake_discs", label: "Brake discs & pads", icon: Disc3 },
    { id: "brake_fluid", label: "Brake fluid", icon: Droplets },
    { id: "spark_plugs", label: "Spark plugs", icon: Zap },
    { id: "wipers", label: "Wipers", icon: Car },
    { id: "tires", label: "Tires", icon: CircleDot },
    { id: "alignment", label: "Alignment & balancing", icon: CircleDot },
    { id: "tire_repair", label: "Tire repair", icon: CircleDot },
    { id: "engine", label: "Engine", icon: Cog },
    { id: "suspension", label: "Suspension", icon: Settings2 },
    { id: "transmission", label: "Transmission / clutch", icon: Cog },
    { id: "fluids", label: "Fluids", icon: Droplets },
    { id: "fuel_filter", label: "Fuel filter", icon: Filter },
    { id: "timing_belt", label: "Timing belt", icon: Link2 },
    { id: "accessory_belt", label: "Accessory belt", icon: Link2 },
    { id: "coolant", label: "Coolant / radiator", icon: Thermometer },
    { id: "ac", label: "Air conditioning", icon: Snowflake },
    { id: "electrical", label: "Electrical / battery", icon: BatteryCharging },
    { id: "body_paint", label: "Body & paint", icon: Paintbrush },
    { id: "tow", label: "Tow", icon: Truck },
    { id: "inspection", label: "Inspection", icon: Gauge },
    { id: "odometer", label: "Odometer reading", icon: Gauge },
    { id: "other", label: "Other", icon: Wrench },
  ],
  upgrade: [
    { id: "performance", label: "Performance", icon: Gauge },
    { id: "lighting", label: "Lighting", icon: Lightbulb },
    { id: "audio", label: "Audio / multimedia", icon: Music },
    { id: "interior", label: "Interior", icon: Sofa },
    { id: "exterior", label: "Exterior / aero", icon: Car },
    { id: "wheels", label: "Wheels & tires", icon: CircleDot },
    { id: "suspension_up", label: "Suspension", icon: Settings2 },
    { id: "protection", label: "Protection / security", icon: ShieldCheck },
    { id: "accessory", label: "Accessory", icon: Sparkles },
    { id: "other", label: "Other", icon: Sparkles },
  ],
  expense: [
    { id: "tax", label: "Taxes (IPVA)", icon: Landmark },
    { id: "insurance", label: "Insurance", icon: ShieldCheck },
    { id: "registration", label: "Registration / licensing", icon: FileText },
    { id: "fine", label: "Fine", icon: Siren },
    { id: "parking", label: "Parking", icon: CircleParking },
    { id: "toll", label: "Toll", icon: ReceiptText },
    { id: "wash", label: "Wash / detailing", icon: ShowerHead },
    { id: "financing", label: "Financing", icon: Landmark },
    { id: "other", label: "Other", icon: ReceiptText },
  ],
};

export const FUEL_TYPES = ["Regular", "Premium", "Ethanol", "Diesel", "CNG", "Electric"];

export function categoryOf(kind: Kind, id: string | null): Category | undefined {
  if (kind === "fuel" || !id) return undefined;
  return CATEGORIES[kind].find((c) => c.id === id);
}

/** Title shown for an entry: explicit title, else category label, else kind label. */
export function entryLabel(e: { kind: Kind; category: string | null; title: string | null; fuel_type?: string | null }) {
  if (e.title) return e.title;
  if (e.kind === "fuel") return e.fuel_type ?? "Fuel";
  return categoryOf(e.kind, e.category)?.label ?? KINDS[e.kind].label;
}

export function entryIcon(e: { kind: Kind; category: string | null }): LucideIcon {
  return categoryOf(e.kind, e.category)?.icon ?? KINDS[e.kind].icon;
}
