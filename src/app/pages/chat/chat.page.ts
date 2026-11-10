import { Component, OnDestroy, OnInit, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { IonContent, IonFooter, IonHeader } from '@ionic/angular';
import { Geolocation } from '@capacitor/geolocation';
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
  draft = signal('');

  menuOpen = signal(false);                 // menú de adjuntos
  busy = signal<string | null>(null);       // texto mientras se envía un adjunto
  notice = signal('');                      // aviso de error temporal
  urls = signal<Record<string, string>>({}); // id del mensaje -> URL firmada de la imagen
  viewer = signal<string | null>(null);     // imagen a pantalla completa

  private channel?: RealtimeChannel;

  ngOnInit() {
    this.channel = this.chat.subscribe(this.roomId, m => this.add(m));
    this.load();
  }

  ngOnDestroy() {
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

      const ids = new Set(history.map(m => m.id));
      const live = this.messages().filter(m => !ids.has(m.id));
      this.messages.set([...history, ...live]);
      this.messages().forEach(m => this.resolve(m));
      this.scroll(0);
    } catch {
      this.failed.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  private add(m: Message) {
    if (this.messages().some(x => x.id === m.id)) return;
    this.messages.update(list => [...list, m]);
    this.resolve(m);
    this.scroll();
  }

  // Pide la URL firmada de una imagen para poder mostrarla
  private async resolve(m: Message) {
    if (m.type !== 'image' || !m.file_path || this.urls()[m.id]) return;
    try {
      const url = await this.chat.signedUrl(m.file_path);
      this.urls.update(u => ({ ...u, [m.id]: url }));
    } catch { /* si falla, queda el recuadro gris */ }
  }

  // ---- Texto ----
  async send() {
    const text = this.draft().trim();
    if (!text || this.sending()) return;

    this.sending.set(true);
    this.draft.set('');
    try {
      this.add(await this.chat.send(this.roomId, text));
    } catch {
      this.draft.set(text);
      this.flash('No se pudo enviar. Toca enviar para reintentar.');
    } finally {
      this.sending.set(false);
    }
  }

  // Envoltorio común: muestra "Enviando…"
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

  // Saca el archivo elegido y limpia el input (para poder elegir el mismo otra vez)
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

  // Descarga un archivo recibido 
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

  // ---- Utilidades de la vista ----
  onInput(ev: Event) {
    this.draft.set((ev.target as HTMLInputElement).value);
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
