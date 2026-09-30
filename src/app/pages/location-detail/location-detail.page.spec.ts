import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { LocationDetailPage } from './location-detail.page';

describe('LocationDetailPage', () => {
  it('should create (and show "no longer exists" for an unknown id)', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(LocationDetailPage);
    fixture.componentRef.setInput('id', '999'); // the route parameter
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('This place no longer exists.');
  });
});
