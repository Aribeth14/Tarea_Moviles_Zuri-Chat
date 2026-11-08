import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AlertController, IonContent } from '@ionic/angular';
import { AuthService } from '../../services/auth.service';
import { ProfileService } from '../../services/profile.service';
import { AvatarComponent } from '../../components/avatar/avatar.component';
import { resizeImage } from '../../utils/image';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.page.html',
  styleUrls: ['./profile.page.scss'],
  imports: [IonContent, ReactiveFormsModule, AvatarComponent],
})
export class ProfilePage implements OnInit {
  private fb = inject(FormBuilder);
  private profiles = inject(ProfileService);
  private auth = inject(AuthService);
  private router = inject(Router);
  private alerts = inject(AlertController);

  me = this.profiles.me;

  form = this.fb.nonNullable.group({
    username: ['', [Validators.required, Validators.minLength(3)]],
    bio: ['', Validators.maxLength(120)],
  });

  saving = signal(false);
  uploading = signal(false);
  message = signal('');
  error = signal('');

  async ngOnInit() {
    if (!this.me()) await this.profiles.loadMe();
    const m = this.me();
    if (m) this.form.patchValue({ username: m.username, bio: m.bio ?? '' });
    this.form.markAsPristine(); // así "Guardar" empieza desactivado
  }

  async save() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    this.error.set('');
    try {
      await this.profiles.updateProfile(this.form.getRawValue());
      this.form.markAsPristine();
      this.flash('Cambios guardados ✓');
    } catch {
      this.error.set('No pudimos guardar los cambios. Inténtalo de nuevo.');
    } finally {
      this.saving.set(false);
    }
  }

  async onFile(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // permite elegir la misma foto otra vez
    if (!file) return;

    if (!file.type.startsWith('image/')) { this.error.set('Elige un archivo de imagen.'); return; }
    if (file.size > 10 * 1024 * 1024) { this.error.set('La imagen pesa más de 10 MB.'); return; }

    this.uploading.set(true);
    this.error.set('');
    try {
      const small = await resizeImage(file);
      await this.profiles.uploadAvatar(small);
      this.flash('Foto actualizada ✓');
    } catch {
      this.error.set('No pudimos subir la foto. Inténtalo de nuevo.');
    } finally {
      this.uploading.set(false);
    }
  }

  // Confirmación antes de una acción importante
  async confirmLogout() {
    const alert = await this.alerts.create({
      header: '¿Cerrar sesión?',
      message: 'Tendrás que volver a entrar con tu correo y contraseña.',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Cerrar sesión', role: 'destructive', handler: () => this.logout() },
      ],
    });
    await alert.present();
  }

  private async logout() {
    await this.auth.logout();
    this.router.navigateByUrl('/login', { replaceUrl: true });
  }

  back() {
    this.router.navigateByUrl('/home');
  }

  // Mensaje que desaparece solo a los 2.5 s
  private flash(text: string) {
    this.message.set(text);
    setTimeout(() => this.message.set(''), 2500);
  }

  invalid(name: 'username' | 'bio') {
    const c = this.form.controls[name];
    return c.invalid && c.touched;
  }
}
