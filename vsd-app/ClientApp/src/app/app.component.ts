import { Component, OnInit, Renderer2 } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { BreadcrumbComponent } from './breadcrumb/breadcrumb.component';
import { UserDataService } from './services/user-data.service';
import { VersionInfoDataService } from './services/version-info-data.service';
import { User } from './models/user.model';
import { VersionInfo } from './models/version-info.model';
import { isDevMode } from '@angular/core';
import { MatDialog } from '@angular/material';
import { AdoxioLegalEntityDataService } from './services/adoxio-legal-entity-data.service';
import { AdoxioLegalEntity } from './models/adoxio-legalentities.model';
import { Store } from '@ngrx/store';
import { AppState } from './app-state/models/app-state';
import { Observable } from '../../node_modules/rxjs';
import 'rxjs/add/operator/filter';

import * as CurrentUserActions from './app-state/actions/current-user.action';
import { filter } from 'rxjs/operators';
import { VersionInfoDialog } from './version-info/version-info.component';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
  businessProfiles: AdoxioLegalEntity[];   // SLATE FOR REMOVAL
  title = '';
  previousUrl: string;
  public currentUser: User;  // PROBABLY DON'T NEED
  public versionInfo: VersionInfo;
  public isNewUser: boolean;
  public isDevMode: boolean;
  isAssociate = false;     // PROBABLY DON'T NEED
  
  constructor(
    private renderer: Renderer2,
    private router: Router,
    private userDataService: UserDataService,
    private versionInfoDataService: VersionInfoDataService,
    private store: Store<AppState>,
    private dialog: MatDialog
  ) {
    this.isDevMode = isDevMode();
    this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        let prevSlug = this.previousUrl;
        let nextSlug = event.url.slice(1);
        if (!nextSlug) nextSlug = 'home';
        if (prevSlug) {
          this.renderer.removeClass(document.body, 'ctx-' + prevSlug);
        }
        if (nextSlug) {
          this.renderer.addClass(document.body, 'ctx-' + nextSlug);
        }
        this.previousUrl = nextSlug;
      }
    });
  }

  ngOnInit(): void {
  }

  loadVersionInfo() {
    this.versionInfoDataService.getVersionInfo()
      .subscribe((versionInfo: VersionInfo) => {
        this.versionInfo = versionInfo;
      });
  }

  isIE10orLower() {
    let result, jscriptVersion;
    result = false;

    jscriptVersion = new Function('/*@cc_on return @_jscript_version; @*/')();

    if (jscriptVersion !== undefined) {
      result = true;
    }
    return result;
  }

  showVersionInfo(): void {
    this.dialog.open(VersionInfoDialog, {
      data: this.versionInfo
    });
  }
}
