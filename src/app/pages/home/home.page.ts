import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent } from '@ionic/angular';
import { Profile, ProfileService } from '../../services/profile.service';
import { AvatarComponent } from '../../components/avatar/avatar.component';
import { ToastController} from '@ionic/angular';
import { ChatService } from '../../services/chat.service';

@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
  imports: [IonContent, AvatarComponent],
})
export class HomePage implements OnInit {
  private profiles = inject(ProfileService);
  private router = inject(Router);
  private chat = inject(ChatService);
  private toasts = inject(ToastController);
  opening = signal<string | null>(null); // id de la persona de la cual el chat se abre

  me = this.profiles.me;
  users = signal<Profile[]>([]);
  loading = signal(true);
  failed = signal(false);
  query = signal('');

  // Se recalcula sola cada vez que cambia la búsqueda o la lista
  filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    return q ? this.users().filter(u => u.username.toLowerCase().includes(q)) : this.users();
  });

  // Saludo según la hora del día
  greeting = computed(() => {
    const h = new Date().getHours();
    return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
  });

  ngOnInit() {
    this.load();
  }

  async load() {
    this.loading.set(true);
    this.failed.set(false);
    try {
      // Las dos consultas corren a la vez, no una después de otra
      const [users] = await Promise.all([this.profiles.listUsers(), this.profiles.loadMe()]);
      this.users.set(users);
    } catch {
      this.failed.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  onSearch(ev: Event) {
    this.query.set((ev.target as HTMLInputElement).value);
  }

  goProfile() {
    this.router.navigateByUrl('/profile');
  }
    async open(u: Profile) {
    if (this.opening()) return;
    this.opening.set(u.id);
    try {
      const roomId = await this.chat.openDirect(u.id);
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


