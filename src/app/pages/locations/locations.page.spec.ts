import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { LocationsPage } from './locations.page';

describe('LocationsPage', () => {
  it('should create', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(LocationsPage);
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
  });
});
