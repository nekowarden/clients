import { Component } from "@angular/core";

import { StatusFilterComponent as BaseStatusFilterComponent } from "@bitwarden/angular/vault/vault-filter/components/status-filter.component";

@Component({
  selector: "app-status-under-filter",
  templateUrl: "status-under-filter.component.html",
})
export class StatusUnderFilterComponent extends BaseStatusFilterComponent {}
