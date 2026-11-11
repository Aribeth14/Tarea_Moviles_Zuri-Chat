import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NewGroupPage } from './new-group.page';

describe('NewGroupPage', () => {
  let component: NewGroupPage;
  let fixture: ComponentFixture<NewGroupPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(NewGroupPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
