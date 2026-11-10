import { Injectable, inject } from '@angular/core';
import { RealtimeChannel } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';
import { Profile } from './profile.service';
import { resizeImage } from '../utils/image';

export type MessageType = 'text' | 'image' | 'file' | 'location';

export interface Message {
  id: string;
  room_id: string;
  sender_id: string;
  content: string | null;
  created_at: string;
  type: MessageType;
  file_path: string | null;
  file_name: string | null;
  file_size: number | null;
  mime_type: string | null;
  lat: number | null;
  lng: number | null;
}

const BUCKET = 'chat-files';

// Id aleatorio 
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

@Injectable({ providedIn: 'root' })
export class ChatService {
  private sb = inject(SupabaseService).client;

  async openDirect(otherId: string): Promise<string> {
    const { data, error } = await this.sb.rpc('start_direct_chat', { other_id: otherId });
    if (error) throw error;
    return data as string;
  }

  async getPeer(roomId: string, myId: string): Promise<Profile> {
    const { data, error } = await this.sb
      .from('room_members')
      .select('profiles(*)')
      .eq('room_id', roomId)
      .neq('user_id', myId)
      .single();
    if (error) throw error;
    return (data as any).profiles as Profile;
  }

  async getMessages(roomId: string): Promise<Message[]> {
    const { data, error } = await this.sb
      .from('messages')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: true })
      .limit(200);
    if (error) throw error;
    return data as Message[];
  }

  // Inserta una fila en messages y la devuelve
  private async insert(row: Record<string, unknown>): Promise<Message> {
    const { data, error } = await this.sb.from('messages').insert(row).select().single();
    if (error) throw error;
    return data as Message;
  }

  // Sube un archivo al bucket privado
  private async upload(path: string, body: Blob, contentType: string) {
    const { error } = await this.sb.storage.from(BUCKET).upload(path, body, { contentType });
    if (error) throw error;
  }

  send(roomId: string, content: string) {
    return this.insert({ room_id: roomId, type: 'text', content });
  }

  async sendImage(roomId: string, file: File) {
    const small = await resizeImage(file, 1280); // máx. 1280 px, JPG
    const path = `${roomId}/${uid()}.jpg`;
    await this.upload(path, small, 'image/jpeg');
    return this.insert({
      room_id: roomId, type: 'image', file_path: path,
      file_name: file.name, file_size: small.size, mime_type: 'image/jpeg',
    });
  }

  async sendFile(roomId: string, file: File) {
    // La ruta en Storage solo admite caracteres simples
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${roomId}/${uid()}-${safe}`;
    const type = file.type || 'application/octet-stream';
    await this.upload(path, file, type);
    return this.insert({
      room_id: roomId, type: 'file', file_path: path,
      file_name: file.name, file_size: file.size, mime_type: type,
    });
  }

  sendLocation(roomId: string, lat: number, lng: number) {
    return this.insert({ room_id: roomId, type: 'location', lat, lng });
  }

  // Enlace temporal (1 hora) para ver o descargar un archivo privado
  async signedUrl(path: string, download?: string | boolean): Promise<string> {
    const { data, error } = await this.sb.storage
      .from(BUCKET)
      .createSignedUrl(path, 3600, download ? { download } : undefined);
    if (error) throw error;
    return data.signedUrl;
  }

  subscribe(roomId: string, onMessage: (m: Message) => void): RealtimeChannel {
    return this.sb
      .channel(`room:${roomId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` },
        payload => onMessage(payload.new as Message)
      )
      .subscribe();
  }

  unsubscribe(channel: RealtimeChannel) {
    this.sb.removeChannel(channel);
  }
}

