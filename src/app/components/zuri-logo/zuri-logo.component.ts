import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-zuri-logo',
  standalone: true,
  template: `<img src="/assets/logo.jpg" [style.width.px]="size" [style.height.px]="size" alt="Logo de Zuri" />`,
  styles: [`img { display: block; border-radius: 22%; }`],
})
export class ZuriLogoComponent {
  @Input() size = 80;
}
