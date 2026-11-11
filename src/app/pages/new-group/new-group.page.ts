import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent, IonFooter } from '@ionic/angular';
import { ChatService } from '../../services/chat.service';
import { Profile, ProfileService } from '../../services/profile.service';
import { AvatarComponent } from '../../components/avatar/avatar.component';
import { resizeImage } from '../../utils/image';

@Component({
  selector: 'app-new-group',
  templateUrl: './new-group.page.html',
  styleUrls: ['./new-group.page.scss'],
  imports: [IonContent, IonFooter, AvatarComponent],
})
export class NewGroupPage implements OnInit, OnDestroy {
  private profiles = inject(ProfileService);
  private chat = inject(ChatService);
  private router = inject(Router);

  users = signal<Profile[]>([]);
  loading = signal(true);
  failed = signal(false);

  name = signal('');
  selected = signal<Set<string>>(new Set());
  photo = signal<Blob | null>(null);
  preview = signal<string | null>(null);
  creating = signal(false);
  error = signal('');

  // Texto del botón - le dice a la persona qué le falta
  hint = computed(() => {
    if (this.name().trim().length < 2) return 'Escribe un nombre';
    if (this.selected().size < 2) return 'Elige al menos 2 personas';
    return 'Crear grupo ✦';
  });
  canCreate = computed(
    () => this.name().trim().length >= 2 && this.selected().size >= 2 && !this.creating()
  );

  ngOnInit() {
    this.load();
  }

  ngOnDestroy() {
    const p = this.preview();
    if (p) URL.revokeObjectURL(p); // libera la miniatura de la memoria
  }

  async load() {
    this.loading.set(true);
    this.failed.set(false);
    try {
      this.users.set(await this.profiles.listUsers());
    } catch {
      this.failed.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  onName(ev: Event) {
    this.name.set((ev.target as HTMLInputElement).value);
  }

  toggle(id: string) {
    this.selected.update(s => {
      const next = new Set(s); // copia nueva: así la vista se entera del cambio
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async onPhoto(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { this.error.set('Elige un archivo de imagen.'); return; }
    if (file.size > 10 * 1024 * 1024) { this.error.set('La imagen pesa más de 10 MB.'); return; }

    try {
      const small = await resizeImage(file);
      const old = this.preview();
      if (old) URL.revokeObjectURL(old);
      this.photo.set(small);
      this.preview.set(URL.createObjectURL(small));
      this.error.set('');
    } catch {
      this.error.set('No pudimos procesar esa imagen.');
    }
  }

  async create() {
    if (!this.canCreate()) return;
    this.creating.set(true);
    this.error.set('');
    try {
      // La foto se sube solo ahora, así no queda nada guardado si la persona cancela
      const blob = this.photo();
      const url = blob ? await this.profiles.uploadPublicImage(blob) : null;
      const roomId = await this.chat.createGroup(this.name().trim(), [...this.selected()], url);
      await this.router.navigate(['/chat', roomId], { replaceUrl: true });
    } catch {
      this.error.set('No pudimos crear el grupo. Inténtalo de nuevo.');
    } finally {
      this.creating.set(false);
    }
  }

  back() {
    this.router.navigateByUrl('/home');
  }
}
