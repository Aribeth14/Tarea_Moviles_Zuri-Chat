import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent, ToastController } from '@ionic/angular';
import { RealtimeChannel } from '@supabase/supabase-js';
import { AuthService } from '../../services/auth.service';
import { ChatService, Conversation } from '../../services/chat.service';
import { Profile, ProfileService } from '../../services/profile.service';
import { AvatarComponent } from '../../components/avatar/avatar.component';

@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
  imports: [IonContent, AvatarComponent],
})
export class HomePage implements OnInit, OnDestroy {
  private profiles = inject(ProfileService);
  private chat = inject(ChatService);
  private auth = inject(AuthService);
  private router = inject(Router);
  private toasts = inject(ToastController);

  me = this.profiles.me;
  convs = signal<Conversation[]>([]);
  users = signal<Profile[]>([]);
  loading = signal(true);
  failed = signal(false);
  query = signal('');

  // "Nueva conversación"
  sheet = signal(false);
  pq = signal('');
  opening = signal<string | null>(null);

  private channel?: RealtimeChannel;
  private timer?: ReturnType<typeof setTimeout>;
  private loaded = false;

  get myId() {
    return this.auth.user()?.id ?? '';
  }

  // id -> nombre, para mostrar "Eli: hola" en los grupos
  names = computed(() => new Map(this.users().map(u => [u.id, u.username] as [string, string])));

  // Búsqueda de conversaciones: por nombre o por el texto del último mensaje
  filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    if (!q) return this.convs();
    return this.convs().filter(
      c => (c.title ?? '').toLowerCase().includes(q) || this.preview(c).toLowerCase().includes(q)
    );
  });

  people = computed(() => {
    const q = this.pq().trim().toLowerCase();
    return q ? this.users().filter(u => u.username.toLowerCase().includes(q)) : this.users();
  });

  greeting = computed(() => {
    const h = new Date().getHours();
    return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
  });

  ngOnInit() {
    // Si llega un mensaje o me añaden a un grupo, actualizacion de la lista inmediata 
    this.channel = this.chat.subscribeInbox(this.myId, () => this.refreshSoon());
    this.load();
  }

  // Ionic lo llama cada vez que vuelves a esta pantalla (por ejemplo, desde un chat)
  ionViewWillEnter() {
    if (this.loaded) this.refreshSoon();
  }

  ngOnDestroy() {
    clearTimeout(this.timer);
    if (this.channel) this.chat.unsubscribe(this.channel);
  }

  async load() {
    this.loading.set(true);
    this.failed.set(false);
    try {
      const [convs, users] = await Promise.all([
        this.chat.conversations(),
        this.profiles.listUsers(),
        this.profiles.loadMe(),
      ]);
      this.convs.set(convs);
      this.users.set(users);
      this.loaded = true;
    } catch {
      this.failed.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  // Recarga silenciosa 
  private refreshSoon() {
    clearTimeout(this.timer);
    this.timer = setTimeout(async () => {
      try {
        this.convs.set(await this.chat.conversations());
      } catch { /* si falla, se queda la lista anterior */ }
    }, 300);
  }

  // Texto del último mensaje, según su tipo
  preview(c: Conversation): string {
    if (!c.last_type) return 'Sin mensajes todavía';
    const body =
      c.last_type === 'image' ? '📷 Imagen'
      : c.last_type === 'file' ? `📎 ${c.last_file_name ?? 'Archivo'}`
      : c.last_type === 'location' ? '📍 Ubicación'
      : (c.last_content ?? '');
    if (c.last_sender === this.myId) return `Tú: ${body}`;
    if (c.is_group) return `${this.names().get(c.last_sender ?? '') ?? 'Alguien'}: ${body}`;
    return body;
  }

  // Hora si es de hoy, "Ayer", o la fecha
  when(iso: string): string {
    const d = new Date(iso);
    const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((day(new Date()) - day(d)) / 86400000);
    if (diff === 0) return d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
    if (diff === 1) return 'Ayer';
    return d.toLocaleDateString('es', { day: '2-digit', month: '2-digit' });
  }

  onSearch(ev: Event) {
    this.query.set((ev.target as HTMLInputElement).value);
  }

  onPeopleSearch(ev: Event) {
    this.pq.set((ev.target as HTMLInputElement).value);
  }

  goProfile() {
    this.router.navigateByUrl('/profile');
  }

  openRoom(c: Conversation) {
    this.router.navigate(['/chat', c.room_id]);
  }

  // Abre la hoja y refresca la lista de personas (si alguien se registro despues)
  openSheet() {
    this.pq.set('');
    this.sheet.set(true);
    this.profiles.listUsers().then(u => this.users.set(u)).catch(() => {});
  }

  newGroup() {
    this.sheet.set(false);
    this.router.navigateByUrl('/new-group');
  }

  async openPerson(u: Profile) {
    if (this.opening()) return;
    this.opening.set(u.id);
    try {
      const roomId = await this.chat.openDirect(u.id);
      this.sheet.set(false);
      await this.router.navigate(['/chat', roomId]);
    } catch {
      const t = await this.toasts.create({
        message: 'No pudimos abrir el chat. Inténtalo de nuevo.',
        duration: 2500,
        position: 'top',
      });
      await t.present();
    } finally {
      this.opening.set(null);
    }
  }
}
