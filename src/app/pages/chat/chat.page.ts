import { Component, OnDestroy, OnInit, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { IonContent, IonFooter, IonHeader } from '@ionic/angular';
import { RealtimeChannel } from '@supabase/supabase-js';
import { AuthService } from '../../services/auth.service';
import { Message, ChatService } from '../../services/chat.service';
import { Profile } from '../../services/profile.service';
import { AvatarComponent } from '../../components/avatar/avatar.component';

@Component({
  selector: 'app-chat',
  templateUrl: './chat.page.html',
  styleUrls: ['./chat.page.scss'],
  imports: [IonContent, IonHeader, IonFooter, AvatarComponent],
})
export class ChatPage implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private chat = inject(ChatService);
  private auth = inject(AuthService);

  content = viewChild(IonContent);

  roomId = this.route.snapshot.paramMap.get('roomId')!;
  myId = this.auth.user()!.id;

  peer = signal<Profile | null>(null);
  messages = signal<Message[]>([]);
  loading = signal(true);
  failed = signal(false);
  sending = signal(false);
  sendError = signal(false);
  draft = signal('');

  private channel?: RealtimeChannel;

  ngOnInit() {
    // Primero escuchamos, luego cargamos el historial: así no se pierde nada en medio
    this.channel = this.chat.subscribe(this.roomId, m => this.add(m));
    this.load();
  }

  ngOnDestroy() {
    // Al salir de la pantalla cerramos el canal para no gastar conexión
    if (this.channel) this.chat.unsubscribe(this.channel);
  }

  async load() {
    this.loading.set(true);
    this.failed.set(false);
    try {
      const [peer, history] = await Promise.all([
        this.chat.getPeer(this.roomId, this.myId),
        this.chat.getMessages(this.roomId),
      ]);
      this.peer.set(peer);

      // Une el historial con lo que haya llegado en vivo- evitando duplicados 
      const ids = new Set(history.map(m => m.id));
      const live = this.messages().filter(m => !ids.has(m.id));
      this.messages.set([...history, ...live]);
      this.scroll(0);
    } catch {
      this.failed.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  // Añade un mensaje solo si todavia no esta en lista
  private add(m: Message) {
    if (this.messages().some(x => x.id === m.id)) return;
    this.messages.update(list => [...list, m]);
    this.scroll();
  }

  async send() {
    const text = this.draft().trim();
    if (!text || this.sending()) return;

    this.sending.set(true);
    this.sendError.set(false);
    this.draft.set('');
    try {
      const saved = await this.chat.send(this.roomId, text);
      this.add(saved);
    } catch {
      this.draft.set(text); // devolvemos el texto para no perderse 
      this.sendError.set(true);
    } finally {
      this.sending.set(false);
    }
  }

  onInput(ev: Event) {
    this.draft.set((ev.target as HTMLInputElement).value);
  }

  isMine(m: Message) {
    return m.sender_id === this.myId;
  }

  time(iso: string) {
    return new Date(iso).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  }

  scroll(ms = 250) {
    setTimeout(() => this.content()?.scrollToBottom(ms), 60);
  }

  back() {
    this.router.navigateByUrl('/home');
  }
}

