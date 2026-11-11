import { Component, HostListener, OnDestroy, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { IonContent, IonFooter, IonHeader } from '@ionic/angular';
import { Geolocation } from '@capacitor/geolocation';
import { RealtimeChannel } from '@supabase/supabase-js';
import { AuthService } from '../../services/auth.service';
import { ChatService, Member, Message, Room } from '../../services/chat.service';
import { PresenceService } from '../../services/presence.service';
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
  private presence = inject(PresenceService);

  content = viewChild(IonContent);

  roomId = this.route.snapshot.paramMap.get('roomId')!;
  myId = this.auth.user()!.id;

  room = signal<Room | null>(null);
  members = signal<Member[]>([]);
  messages = signal<Message[]>([]);
  loading = signal(true);
  failed = signal(false);
  sending = signal(false);
  draft = signal('');

  menuOpen = signal(false);
  panel = signal(false);
  busy = signal<string | null>(null);
  notice = signal('');
  urls = signal<Record<string, string>>({});
  viewer = signal<string | null>(null);

  typers = signal<string[]>([]);   // quiénes escriben ahora (Firebase)
  peerOnline = signal(false);      // la otra persona está en línea (Firebase)

  isGroup = computed(() => this.room()?.is_group ?? false);

  typingText = computed(() => {
    const ids = this.typers();
    if (!ids.length) return '';
    if (!this.isGroup()) return 'escribiendo…';
    const names = ids.map(id => this.nameOf(id));
    return names.length === 1 ? `${names[0]} está escribiendo…`
      : names.length === 2 ? `${names[0]} y ${names[1]} están escribiendo…`
      : 'Varias personas están escribiendo…';
  });

  // Datos de la cabecera: el grupo, o la otra persona si es un chat directo
  head = computed(() => {
    const r = this.room();
    const ms = this.members();
    const typing = this.typingText();
    if (!r) return { name: '…', sub: '', avatar: null as string | null, live: false };
    if (r.is_group) {
      return { name: r.name ?? 'Grupo', sub: typing || `${ms.length} integrantes`, avatar: r.avatar_url, live: !!typing };
    }
    const p = ms.find(m => m.user_id !== this.myId)?.profiles;
    const online = this.peerOnline();
    return {
      name: p?.username ?? '…',
      sub: typing || (online ? 'En línea' : (p?.bio ?? '')),
      avatar: p?.avatar_url ?? null,
      live: !!typing || online,
    };
  });

  private channel?: RealtimeChannel;
  private unwatchTyping?: () => void;
  private unwatchPresence?: () => void;
  private lastPing = 0;
  private idle?: ReturnType<typeof setTimeout>;

  ngOnInit() {
    this.channel = this.chat.subscribe(
      this.roomId,
      m => this.add(m),
      (userId, at) => this.setRead(userId, at)
    );
    this.unwatchTyping = this.presence.watchTyping(this.roomId, this.myId, ids => {
      const wasEmpty = this.typers().length === 0;
      this.typers.set(ids);
      if (wasEmpty && ids.length) this.scroll(); // baja para ver los puntitos
    });
    this.load();
  }

  ngOnDestroy() {
    this.stopTyping();
    this.unwatchTyping?.();
    this.unwatchPresence?.();
    if (this.channel) this.chat.unsubscribe(this.channel);
  }

  async load() {
    this.loading.set(true);
    this.failed.set(false);
    try {
      const [info, history] = await Promise.all([
        this.chat.getRoom(this.roomId),
        this.chat.getMessages(this.roomId),
      ]);
      this.room.set(info.room);
      this.members.set(info.members);
      this.watchPeer();

      const ids = new Set(history.map(m => m.id));
      const live = this.messages().filter(m => !ids.has(m.id));
      this.messages.set([...history, ...live]);
      this.messages().forEach(m => this.resolve(m));
      this.scroll(0);
      this.markRead();
    } catch {
      this.failed.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  // ---- Firebase: en línea y escribiendo ----
  private watchPeer() {
    if (this.unwatchPresence || this.isGroup()) return;
    const peer = this.members().find(m => m.user_id !== this.myId);
    if (peer) this.unwatchPresence = this.presence.watchPresence(peer.user_id, on => this.peerOnline.set(on));
  }

  // Avisa que estoy escribiendo 
  private pingTyping(text: string) {
    if (!text.trim()) { this.stopTyping(); return; }
    const now = Date.now();
    if (now - this.lastPing > 2500) {
      this.lastPing = now;
      this.presence.setTyping(this.roomId);
    }
    clearTimeout(this.idle);
    this.idle = setTimeout(() => this.stopTyping(), 3000);
  }

  private stopTyping() {
    clearTimeout(this.idle);
    if (this.lastPing) {
      this.lastPing = 0;
      this.presence.clearTyping(this.roomId);
    }
  }

  // Leído
  private markRead() {
    if (document.visibilityState !== 'visible') return;
    this.chat.markRead(this.roomId).catch(() => {});
  }

  @HostListener('document:visibilitychange')
  onVisible() {
    if (document.visibilityState === 'visible') this.markRead();
  }

  private setRead(userId: string, at: string | null) {
    this.members.update(list => list.map(m => (m.user_id === userId ? { ...m, last_read_at: at } : m)));
  }

  seenBy(m: Message): number {
    const t = new Date(m.created_at).getTime();
    return this.members().filter(
      x => x.user_id !== this.myId && x.last_read_at && new Date(x.last_read_at).getTime() >= t
    ).length;
  }

  status(m: Message): string {
    const n = this.seenBy(m);
    if (!this.isGroup()) return n ? '✓✓ Visto' : '✓ Enviado';
    return n ? `Visto por ${n}` : '✓ Enviado';
  }

  // Grupos
  nameOf(userId: string): string {
    return this.members().find(m => m.user_id === userId)?.profiles.username ?? 'Alguien';
  }

  showName(i: number): boolean {
    const list = this.messages();
    return i === 0 || list[i - 1].sender_id !== list[i].sender_id;
  }

  // Mensajes 
  private add(m: Message) {
    if (this.messages().some(x => x.id === m.id)) return;
    this.messages.update(list => [...list, m]);
    this.resolve(m);
    this.scroll();
    if (!this.isMine(m)) this.markRead();
  }

  private async resolve(m: Message) {
    if (m.type !== 'image' || !m.file_path || this.urls()[m.id]) return;
    try {
      const url = await this.chat.signedUrl(m.file_path);
      this.urls.update(u => ({ ...u, [m.id]: url }));
    } catch { /* si falla, queda el recuadro gris */ }
  }

  async send() {
    const text = this.draft().trim();
    if (!text || this.sending()) return;

    this.sending.set(true);
    this.draft.set('');
    this.stopTyping();
    try {
      this.add(await this.chat.send(this.roomId, text));
    } catch {
      this.draft.set(text);
      this.flash('No se pudo enviar. Toca enviar para reintentar.');
    } finally {
      this.sending.set(false);
    }
  }

  // Adjuntos 
  private async run(label: string, job: () => Promise<Message>) {
    if (this.busy()) return;
    this.busy.set(label);
    this.menuOpen.set(false);
    try {
      this.add(await job());
    } catch (e: any) {
      const msg = String(e?.message ?? '').toLowerCase();
      this.flash(
        msg.includes('denied') || msg.includes('permission')
          ? 'Permite el acceso a la ubicación para poder compartirla.'
          : msg.includes('timeout')
          ? 'Tardó demasiado en obtener tu ubicación.'
          : msg.includes('size') || msg.includes('too large')
          ? 'El archivo es demasiado grande.'
          : 'No se pudo enviar. Inténtalo de nuevo.'
      );
    } finally {
      this.busy.set(null);
    }
  }

  private takeFile(ev: Event): File | null {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    return file;
  }

  onImage(ev: Event) {
    const file = this.takeFile(ev);
    if (!file) return;
    if (!file.type.startsWith('image/')) return this.flash('Elige un archivo de imagen.');
    if (file.size > 20 * 1024 * 1024) return this.flash('La imagen pesa más de 20 MB.');
    this.run('Enviando imagen…', () => this.chat.sendImage(this.roomId, file));
  }

  onFile(ev: Event) {
    const file = this.takeFile(ev);
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return this.flash('El archivo pesa más de 10 MB.');
    this.run('Enviando archivo…', () => this.chat.sendFile(this.roomId, file));
  }

  shareLocation() {
    this.run('Obteniendo ubicación…', async () => {
      const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000 });
      return this.chat.sendLocation(this.roomId, pos.coords.latitude, pos.coords.longitude);
    });
  }

  async openFile(m: Message) {
    if (!m.file_path) return;
    try {
      const url = await this.chat.signedUrl(m.file_path, m.file_name ?? true);
      const a = document.createElement('a');
      a.href = url;
      a.rel = 'noopener';
      a.click();
    } catch {
      this.flash('No se pudo abrir el archivo.');
    }
  }

  openViewer(m: Message) {
    const url = this.urls()[m.id];
    if (url) this.viewer.set(url);
  }

  // Utilidades de la vista
  onInput(ev: Event) {
    const value = (ev.target as HTMLInputElement).value;
    this.draft.set(value);
    this.pingTyping(value);
  }

  isMine(m: Message) {
    return m.sender_id === this.myId;
  }

  time(iso: string) {
    return new Date(iso).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  }

  size(bytes: number | null) {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  ext(name: string | null) {
    return (name?.split('.').pop() ?? 'file').slice(0, 4).toUpperCase();
  }

  coords(m: Message) {
    return `${m.lat?.toFixed(5)}, ${m.lng?.toFixed(5)}`;
  }

  mapsUrl(m: Message) {
    return `https://www.google.com/maps?q=${m.lat},${m.lng}`;
  }

  private flash(text: string) {
    this.notice.set(text);
    setTimeout(() => this.notice.set(''), 3500);
  }

  scroll(ms = 250) {
    setTimeout(() => this.content()?.scrollToBottom(ms), 60);
  }

  back() {
    this.router.navigateByUrl('/home');
  }
}

