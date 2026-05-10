export type FormElement =
  | HTMLInputElement
  | HTMLSelectElement
  | HTMLTextAreaElement;

export interface FormValidatorInitResultParams {
  observableElementList: FormElement[];
  extraData?: Record<string, unknown>;
}

export default class FormValidatorInitResult {
  declare readonly extraData: Readonly<Record<string, unknown>>;

  readonly #elementList: FormElement[];

  constructor({
    observableElementList,
    extraData = {},
  }: FormValidatorInitResultParams) {
    this.#elementList = [...observableElementList];
    Object.defineProperty(this, 'extraData', {
      enumerable: true,
      value: Object.freeze({ ...extraData }),
    });
  }

  get observableElementList(): FormElement[] {
    return [...this.#elementList];
  }
}
