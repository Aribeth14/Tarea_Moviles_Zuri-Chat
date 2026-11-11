import { Injectable, effect, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';

// Forma de una fila de la tabla profiles
export interface Profile {
  id: string;
  username: string;
  email: string;
  avatar_url: string | null;
  bio: string | null;
}

@Injectable({ providedIn: 'root' })
export class ProfileService {
  private sb = inject(SupabaseService).client;
  private auth = inject(AuthService);

  // Mi perfil
  me = signal<Profile | null>(null);

  constructor() {
    // Si cierro sesión, se limpia mi perfil de la memoria
    effect(() => {
      if (!this.auth.user()) this.me.set(null);
    });
  }

  private get uid() {
    return this.auth.user()!.id;
  }

  async loadMe() {
    const { data, error } = await this.sb
      .from('profiles').select('*').eq('id', this.uid).single();
    if (error) throw error;
    this.me.set(data as Profile);
  }

  // Todos los usuarios menos yo
  async listUsers(): Promise<Profile[]> {
    const { data, error } = await this.sb
      .from('profiles').select('*').neq('id', this.uid).order('username');
    if (error) throw error;
    return data as Profile[];
  }

  async updateProfile(changes: Partial<Pick<Profile, 'username' | 'bio' | 'avatar_url'>>) {
    const { data, error } = await this.sb
      .from('profiles').update(changes).eq('id', this.uid).select().single();
    if (error) throw error;
    this.me.set(data as Profile);
  }

  async uploadAvatar(image: Blob) {
    // Carpeta = mi id (lo que exige la política). Nombre único para evitar caché.
    const path = `${this.uid}/${Date.now()}.jpg`;
    const { error } = await this.sb.storage
      .from('avatars').upload(path, image, { contentType: 'image/jpeg' });
    if (error) throw error;

    const { data } = this.sb.storage.from('avatars').getPublicUrl(path);
    await this.updateProfile({ avatar_url: data.publicUrl });
  }
    // Sube una imagen a mi carpeta de 'avatars' y devuelve su URL pública (foto de un grupo)
  async uploadPublicImage(image: Blob): Promise<string> {
    const path = `${this.uid}/${Date.now()}-grupo.jpg`;
    const { error } = await this.sb.storage
      .from('avatars').upload(path, image, { contentType: 'image/jpeg' });
    if (error) throw error;
    return this.sb.storage.from('avatars').getPublicUrl(path).data.publicUrl;
  }

}



