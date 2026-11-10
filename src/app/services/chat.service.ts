import { Injectable, inject } from '@angular/core';
import { RealtimeChannel } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';
import { Profile } from './profile.service';

export interface Message {
  id: string;
  room_id: string;
  sender_id: string;
  content: string | null;
  created_at: string;
}

@Injectable({ providedIn: 'root' })
export class ChatService {
  private sb = inject(SupabaseService).client;

  // Llama a la función SQL que abre o reutiliza el chat con otra persona
  async openDirect(otherId: string): Promise<string> {
    const { data, error } = await this.sb.rpc('start_direct_chat', { other_id: otherId });
    if (error) throw error;
    return data as string;
  }

  // La otra persona del chat - vemos el nombre y foto
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

  // Guarda el mensaje y devuelve la fila creada
  async send(roomId: string, content: string): Promise<Message> {
    const { data, error } = await this.sb
      .from('messages')
      .insert({ room_id: roomId, content })
      .select()
      .single();
    if (error) throw error;
    return data as Message;
  }

  // Escucha mensajes nuevos de una sala
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
