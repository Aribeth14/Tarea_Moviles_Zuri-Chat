import { Injectable, inject, signal } from '@angular/core';
import { User } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private sb = inject(SupabaseService).client;

  // signal = variable reactiva si  la UI se actualiza cuando cambia
  user = signal<User | null>(null);

  // Promesa que se resuelve cuando ya sabemos si hay sesión guardada
  ready: Promise<void>;

  constructor() {
    // Al abrir la app, recupera la sesión guardada en el teléfono
    this.ready = this.sb.auth.getSession().then(({ data }) => {
      this.user.set(data.session?.user ?? null);
    });

    // Se dispara cada vez que alguien entra o sale
    this.sb.auth.onAuthStateChange((_event, session) => {
      this.user.set(session?.user ?? null);
    });
  }

  async register(username: string, email: string, password: string) {
    const { error } = await this.sb.auth.signUp({
      email,
      password,
      options: { data: { username } }, // el trigger SQL lee este "username"
    });
    if (error) throw error;
  }

  async login(email: string, password: string) {
    const { error } = await this.sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  async logout() {
    await this.sb.auth.signOut();
  }
}