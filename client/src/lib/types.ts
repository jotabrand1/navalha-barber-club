export type Role = "client" | "barber" | "admin";
export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
  active?: boolean;
  specialty?: string;
  bio?: string;
  createdAt?: string;
  visits?: number;
  nextAppointment?: string;
}
export interface Service {
  id: string;
  name: string;
  description: string;
  durationMinutes: number;
  priceCents: number;
  active: boolean;
  category?: string;
  createdAt?: string;
}
export interface Barber {
  id: string;
  name: string;
  specialty: string;
  bio: string;
  initials: string;
  active?: boolean;
  email?: string;
  phone?: string;
}
export type Status = "confirmed" | "pending" | "completed" | "cancelled";
export interface Appointment {
  id: string;
  clientId: string;
  clientName: string;
  barberId: string;
  barberName: string;
  serviceId: string;
  serviceName: string;
  startAt: string;
  durationMinutes: number;
  priceCents: number;
  status: Status;
  notes?: string;
}
export interface Catalog {
  services: Service[];
  barbers: Barber[];
}
