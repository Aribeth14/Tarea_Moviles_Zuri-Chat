import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ZuriLogoComponent } from './zuri-logo.component';

describe('ZuriLogoComponent', () => {
  let component: ZuriLogoComponent;
  let fixture: ComponentFixture<ZuriLogoComponent>;

  beforeEach(() => {
    fixture = TestBed.createComponent(ZuriLogoComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
