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

export interface Room {
  id: string;
  name: string | null;
  avatar_url: string | null;
  is_group: boolean;
}

// Un integrante de la sala 
export interface Member {
  user_id: string;
  last_read_at: string | null;
  profiles: Profile;
}

// Una fila de la lista del Home
export interface Conversation {
  room_id: string;
  is_group: boolean;
  title: string | null;
  avatar_url: string | null;
  peer_id: string | null;
  member_count: number;
  last_type: MessageType | null;
  last_content: string | null;
  last_file_name: string | null;
  last_sender: string | null;
  last_at: string;
  unread: number;
}

const BUCKET = 'chat-files';

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

@Injectable({ providedIn: 'root' })
export class ChatService {
  private sb = inject(SupabaseService).client;

  // Salas
  async openDirect(otherId: string): Promise<string> {
    const { data, error } = await this.sb.rpc('start_direct_chat', { other_id: otherId });
    if (error) throw error;
    return data as string;
  }

  async createGroup(name: string, memberIds: string[], avatarUrl: string | null): Promise<string> {
    const { data, error } = await this.sb.rpc('create_group', {
      p_name: name,
      p_members: memberIds,
      p_avatar: avatarUrl,
    });
    if (error) throw error;
    return data as string;
  }

  async conversations(): Promise<Conversation[]> {
    const { data, error } = await this.sb.rpc('my_conversations');
    if (error) throw error;
    return data as Conversation[];
  }

  // Datos de la sala y de todos sus integrantes (chats en grupo o individuales)
  async getRoom(roomId: string): Promise<{ room: Room; members: Member[] }> {
    const [room, members] = await Promise.all([
      this.sb.from('rooms').select('id, name, avatar_url, is_group').eq('id', roomId).single(),
      this.sb.from('room_members').select('user_id, last_read_at, profiles(*)').eq('room_id', roomId),
    ]);
    if (room.error) throw room.error;
    if (members.error) throw members.error;
    return { room: room.data as Room, members: members.data as unknown as Member[] };
  }

  // Guarda que ya leí esta sala hasta este momento
  async markRead(roomId: string) {
    const { error } = await this.sb.rpc('mark_read', { r: roomId });
    if (error) throw error;
  }

  // Mensajes
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

  private async insert(row: Record<string, unknown>): Promise<Message> {
    const { data, error } = await this.sb.from('messages').insert(row).select().single();
    if (error) throw error;
    return data as Message;
  }

  private async upload(path: string, body: Blob, contentType: string) {
    const { error } = await this.sb.storage.from(BUCKET).upload(path, body, { contentType });
    if (error) throw error;
  }

  send(roomId: string, content: string) {
    return this.insert({ room_id: roomId, type: 'text', content });
  }

  async sendImage(roomId: string, file: File) {
    const small = await resizeImage(file, 1280);
    const path = `${roomId}/${uid()}.jpg`;
    await this.upload(path, small, 'image/jpeg');
    return this.insert({
      room_id: roomId, type: 'image', file_path: path,
      file_name: file.name, file_size: small.size, mime_type: 'image/jpeg',
    });
  }

  async sendFile(roomId: string, file: File) {
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

  async signedUrl(path: string, download?: string | boolean): Promise<string> {
    const { data, error } = await this.sb.storage
      .from(BUCKET)
      .createSignedUrl(path, 3600, download ? { download } : undefined);
    if (error) throw error;
    return data.signedUrl;
  }

  // Tiempo real 
  // Dentro de un chat: mensajes nuevos y cambios de "leído" de los integrantes
  subscribe(
    roomId: string,
    onMessage: (m: Message) => void,
    onRead: (userId: string, lastReadAt: string | null) => void
  ): RealtimeChannel {
    return this.sb
      .channel(`room:${roomId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` },
        p => onMessage(p.new as Message)
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'room_members', filter: `room_id=eq.${roomId}` },
        p => {
          const row = p.new as { user_id: string; last_read_at: string | null };
          onRead(row.user_id, row.last_read_at);
        }
      )
      .subscribe();
  }

  // En el Home: avisa cuando cambia cualquiera de mis conversaciones
  subscribeInbox(myId: string, onChange: () => void): RealtimeChannel {
    return this.sb
      .channel(`inbox:${myId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => onChange())
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'room_members', filter: `user_id=eq.${myId}` },
        () => onChange())
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'room_members', filter: `user_id=eq.${myId}` },
        () => onChange())
      .subscribe();
  }

  unsubscribe(channel: RealtimeChannel) {
    this.sb.removeChannel(channel);
  }
}

