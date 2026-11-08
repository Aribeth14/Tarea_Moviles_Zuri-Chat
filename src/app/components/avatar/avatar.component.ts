import { Component, Input } from '@angular/core';

// Paleta de degradados suaves
const COLORS = [
  'linear-gradient(135deg,#8F6BFF,#6C3CFF)',
  'linear-gradient(135deg,#FF8FB5,#C86BFF)',
  'linear-gradient(135deg,#6C8CFF,#8F6BFF)',
  'linear-gradient(135deg,#B58CFF,#FF9EC4)',
];

@Component({
  selector: 'app-avatar',
  template: `
    @if (url) {
      <img [src]="url" [alt]="name" [style.width.px]="size" [style.height.px]="size" />
    } @else {
      <div class="ph" [style.width.px]="size" [style.height.px]="size"
           [style.font-size.px]="size * 0.42" [style.background]="bg">
        {{ initial }}
      </div>
    }
  `,
  styles: [`
    :host { display: inline-block; line-height: 0; }
    img, .ph { border-radius: 50%; display: block; }
    img { object-fit: cover; }
    .ph { display: flex; align-items: center; justify-content: center;
          color: #fff; font-family: var(--font-display); font-weight: 500; line-height: 1; }
  `],
})
export class AvatarComponent {
  @Input() url: string | null = null;
  @Input() name = '';
  @Input() size = 48;

  get initial() {
    return (this.name.trim()[0] ?? '?').toUpperCase();
  }

  // Mismo nombre = mismo color siempre
  get bg() {
    let sum = 0;
    for (const c of this.name) sum += c.charCodeAt(0);
    return COLORS[sum % COLORS.length];
  }
}
