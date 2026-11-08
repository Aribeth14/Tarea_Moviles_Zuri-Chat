import { Component, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { IonContent } from '@ionic/angular';
import { AuthService } from '../../services/auth.service';
import { ZuriLogoComponent } from '../../components/zuri-logo/zuri-logo.component';

// Validador propio: compara contraseña y confirmación
function sameAs(group: AbstractControl) {
  return group.get('password')?.value === group.get('confirm')?.value ? null : { mismatch: true };
}

@Component({
  selector: 'app-register',
  templateUrl: './register.page.html',
  styleUrls: ['./register.page.scss'],
  imports: [IonContent, ReactiveFormsModule, RouterLink, ZuriLogoComponent],
})
export class RegisterPage {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);

  form = this.fb.nonNullable.group(
    {
      username: ['', [Validators.required, Validators.minLength(3)]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      confirm: ['', Validators.required],
    },
    { validators: sameAs }
  );

  loading = signal(false);
  error = signal('');

  async submit() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.loading.set(true);
    this.error.set('');
    try {
      const { username, email, password } = this.form.getRawValue();
      await this.auth.register(username, email, password);
      this.router.navigateByUrl('/home', { replaceUrl: true });
    } catch (e: any) {
      this.error.set(
        e.message?.includes('already registered')
          ? 'Ese correo ya tiene una cuenta. Prueba iniciando sesión.'
          : 'No pudimos crear tu cuenta. Inténtalo de nuevo.'
      );
    } finally {
      this.loading.set(false);
    }
  }

  invalid(name: string) {
    const c = this.form.get(name)!;
    return c.invalid && c.touched;
  }
}