import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { LocationFormPage } from './location-form.page';

describe('LocationFormPage', () => {
  it('should create', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(LocationFormPage);
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
  });
});
