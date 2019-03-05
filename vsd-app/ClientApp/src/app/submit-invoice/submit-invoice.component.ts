import { Component, OnInit } from '@angular/core';
import { User } from '../models/user.model';
import { Subscription, Observable, Subject, forkJoin } from 'rxjs';
import { FormBuilder, FormGroup, Validators, FormArray, ValidatorFn, AbstractControl, FormControl } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MomentDateAdapter } from '@angular/material-moment-adapter';
import { DateAdapter, MAT_DATE_FORMATS, MAT_DATE_LOCALE } from '@angular/material/core';
import * as _moment from 'moment';
// tslint:disable-next-line:no-duplicate-imports
import { defaultFormat as _rollupMoment } from 'moment';
import { MatSnackBar } from '@angular/material';

import { JusticeApplicationDataService } from '../services/justice-application-data.service';
import { DynamicsApplicationModel } from '../models/dynamics-application.model';
import { PersonalInformationModel } from '../models/justice/personal-information.model';
import { FormBase } from '../shared/form-base';
import { isNumber } from 'ngx-bootstrap/chronos/utils/type-checks';

const moment = _rollupMoment || _moment;

// See the Moment.js docs for the meaning of these formats:
// https://momentjs.com/docs/#/displaying/format/
export const MY_FORMATS = {
  parse: {
    dateInput: 'LL',
  },
  display: {
    dateInput: 'YYYY-MM-DD',
    monthYearLabel: 'MMM YYYY',
    dateA11yLabel: 'YYYY-MM-DD',
    monthYearA11yLabel: 'MMMM YYYY',
  },
};

export const postalRegex = '(^\\d{5}([\-]\\d{4})?$)|(^[A-Za-z][0-9][A-Za-z]\\s?[0-9][A-Za-z][0-9]$)';

@Component({
  selector: 'app-submit-invoice',
  templateUrl: './submit-invoice.component.html',
  styleUrls: ['./submit-invoice.component.scss'],
  providers: [
    // `MomentDateAdapter` can be automatically provided by importing `MomentDateModule` in your
    // application's root module. We provide it at the component level here, due to limitations of
    // our example generation script.
    { provide: DateAdapter, useClass: MomentDateAdapter, deps: [MAT_DATE_LOCALE] },
    { provide: MAT_DATE_FORMATS, useValue: MY_FORMATS },
  ],
})

export class SubmitInvoiceComponent extends FormBase implements OnInit {
  currentUser: User;
  dataLoaded = false;
  busy: Promise<any>;
  busy2: Promise<any>;
  busy3: Promise<any>;
  form: FormGroup;
  formFullyValidated: boolean;
  formSubmitted: boolean = false;

  lineItems: FormArray;

  showRemoveLine: boolean = false;

  public currentFormStep: number;
  public summaryOfBenefitsUrl: string;

  invoiceSubTotal: number = 0.00;
  invoiceGstTotal: number = 0.00;
  invoiceGrandTotal: number = 0.00;

  saveFormData: any;
  
  constructor (
    private justiceDataService: JusticeApplicationDataService,
    private fb: FormBuilder,
    private router: Router,
    private route: ActivatedRoute,
    public snackBar: MatSnackBar
  ) {
    super();

    this.formFullyValidated = false;
    this.currentFormStep = 0;
  }

  ngOnInit() {
    this.summaryOfBenefitsUrl = 'http://gov.bc.ca';
    this.form = this.fb.group({
      invoiceDetails: this.fb.group({
        claimNumber: ['', Validators.required],
        claimantsName: ['', Validators.required],
        invoiceNumber: ['', Validators.required],
        invoiceDate: ['', Validators.required],
        invoiceAddress: this.fb.group({
          line1: ['', Validators.required],
          line2: [''],
          city: ['', Validators.required],
          postalCode: ['', [Validators.required, Validators.pattern(postalRegex)]],
          province: [{ value: 'British Columbia', disabled: false }],
          country: [{ value: 'Canada', disabled: false }],
        }),
        phoneNumber: ['', Validators.required],
        faxNumber: [''],
        email: ['', [Validators.required, Validators.email]],
        nameOfPayee: ['', Validators.required],
        nameOfCounseller: ['', Validators.required],
        paymentType: ['', Validators.required],  // EFT: 100000000  Cheque: 100000001  Wire Transfer: 100000002    --- VALIDATE THESE NUMBERS ARE CORRECT
        counsellorRegistrationNumber: ['', Validators.required],

        settingsCounsellingType: [''],  // Counselling Session: 100000000  Court Support Counselling: 100000001  Psycho-educational sessions: 100000002    --- VALIDATE THESE NUMBERS ARE CORRECT
        settingsNumberOfSessions: [''],
        settingsCounsellingRate: [''],
        settingsSessionDuration: [''], // , Validators.pattern("/^[0-9]+(\.[0-9]{1,2})?$/")
        exemptFromGst: [false],

        lineItems: this.fb.array([this.createLineItem()]),
      }),
    });
  }

  validateAllFormFields(formGroup: any) {
    Object.keys(formGroup.controls).forEach(field => {
      const control = formGroup.get(field);

      if (control instanceof FormControl) {
        control.markAsTouched({ onlySelf: true });
      } else if (control instanceof FormGroup) {
        this.validateAllFormFields(control);
      }
    });
  }

  getErrors(formGroup: any, errors: any = {}) {
    Object.keys(formGroup.controls).forEach(field => {
      const control = formGroup.get(field);
      if (control instanceof FormControl) {
        errors[field] = control.errors;
      } else if (control instanceof FormGroup) {
        errors[field] = this.getErrors(control);
      }
    });
    return errors;
  }

  isFieldValid(field: string) {
    let formField = this.form.get(field);
    if (formField == null)
      return true;

    return this.form.get(field).valid || !this.form.get(field).touched;
  }
  
  isChildFieldValid(parent: string, field: string) {
    let formField = this.form.get(parent);
    if (formField == null)
      return true;

    return formField.get(field).valid || !formField.get(field).touched;
  }

  setLineItems(): void {
    let desiredLines = parseInt(this.form.get('invoiceDetails.settingsNumberOfSessions').value);
    let desiredType = parseInt(this.form.get('invoiceDetails.settingsCounsellingType').value);
    let desiredRate = parseFloat(this.form.get('invoiceDetails.settingsCounsellingRate').value);
    let desiredDuration = parseFloat(this.form.get('invoiceDetails.settingsSessionDuration').value);

    let type: number = 0;
    let rate: string = '';
    let duration: string = '';

    this.lineItems = this.form.get('invoiceDetails.lineItems') as FormArray;
    while (this.lineItems.length !== 0) {
      this.lineItems.removeAt(0)
    }

    if (isNaN(desiredLines) || desiredLines < 0 || desiredLines > 10) {
      desiredLines = 1;
    }

    //    if (isNumber(desiredType))
    type = desiredType;

    //if (!isNaN(desiredRate))
      rate = desiredRate.toString();

    //if (!isNaN(desiredDuration))
      duration = desiredDuration.toString();

    let i: number; 
    for (i = 0; i < desiredLines; i++) {
      this.lineItems.push(this.createLineItem(type, duration, rate));
    }

    this.showRemoveLine = this.lineItems.length > 1;
  }

  addLineItem(): void {
    this.lineItems = this.form.get('invoiceDetails.lineItems') as FormArray;
    this.lineItems.push(this.createLineItem());
    this.showRemoveLine = this.lineItems.length > 1;
  }

  removeLineItem(index: number): void {
    this.lineItems = this.form.get('invoiceDetails.lineItems') as FormArray;
    this.lineItems.removeAt(index);
    this.showRemoveLine = this.lineItems.length > 1;
  }

  createLineItem(type: number = 0, sessionHours: string = '', sessionRate: string = ''): FormGroup {
    return this.fb.group({
      description: ['', Validators.required],
      counsellingType: [type, Validators.required],
      sessionDate: ['', Validators.required],
      sessionHours: [sessionHours],
      sessionRate: [sessionRate],
      sessionAmount: [''],
    });
  }
  
  submitPartialApplication() {
      this.formFullyValidated = true;
      this.save().subscribe(
      data => {
        console.log("submitting partial form");
        this.router.navigate(['/application-success']);
      },
      err => {
        this.snackBar.open('Error submitting application', 'Fail', { duration: 3500, panelClass: ['red-snackbar'] });
        console.log('Error submitting application');
      }
    );
  }
  
  submitApplication() {
    this.formSubmitted = true;
    if (this.form.valid) {
      this.formFullyValidated = true;
      this.save().subscribe(
      data => {
        console.log("submitting");
        this.router.navigate(['/application-success']);
      },
      err => {
        this.snackBar.open('Error submitting application', 'Fail', { duration: 3500, panelClass: ['red-snackbar'] });
        console.log('Error submitting application');
      }
);
    } else {
      console.log("form not validated");
      this.formFullyValidated = false;
      this.markAsTouched();
    }
  }

  testSnaks(): void {
    let content = this.form.get('personalInformation').value;

    let formData = <DynamicsApplicationModel> {
      PersonalInformation: this.form.get('invoiceDetails').value,
    };

    console.log(formData);
  }

  save(): Subject<boolean> {
    const subResult = new Subject<boolean>();
    const formData = <DynamicsApplicationModel>{
      PersonalInformation: this.form.get('invoiceDetails').value,
    };

    this.busy = this.justiceDataService.submitApplication(formData)
        .toPromise()
        .then(res => {
          subResult.next(true);
        }, err => subResult.next(false));
    this.busy2 = Promise.resolve(this.busy);

    return subResult;
  }

  // marking the form as touched makes the validation messages show
  markAsTouched() {
    this.form.get('invoiceDetails').markAsTouched();

    const invoiceControls = (<FormGroup>(this.form.get('invoiceDetails'))).controls;
    for (const c in invoiceControls) {
      if (typeof (invoiceControls[c].markAsTouched) === 'function') {
        invoiceControls[c].markAsTouched();
      }
    }

    const invoiceAddressControls = (<FormGroup>(this.form.get('invoiceDetails.invoiceAddress'))).controls;
    for (const c in invoiceAddressControls) {
      if (typeof (invoiceAddressControls[c].markAsTouched) === 'function') {
        invoiceAddressControls[c].markAsTouched();
      }
    }
  }
}
