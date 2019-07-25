import FormValidatorValidationResult from './FormValidatorValidationResult';

/**
 * @typedef {Array.<(HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement)>} ValidatorInitResult_t
 */

/**
 * @typedef {Function} ValidatorInitFunction_t
 * @param {(HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement)} targetElement
 * @param {Object.<string,*>} parameters
 * @returns {ValidatorInitResult_t}
 */

/**
 * @typedef {Function} ValidatorValidateFunction_t
 * @param {(HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement)} targetElement
 * @param {Object.<string,*>} parameters *
 * @returns {FormValidatorValidationResult}
 */

/**
 * @typedef {Object} ValidatorDeclaration_t
 * @property {ValidatorInitFunction_t} init
 * @property {ValidatorValidateFunction_t} validate
 */

/**
 * @typedef {Object.<string,ValidatorDeclaration_t>} ValidatorDeclarations_t
 */

/**
 * @typedef {Object} FormValidatorParams_t
 * @property {HTMLFormElement} form
 * @property {ValidatorDeclarations_t} [validatorDeclarations={}]
 * @property [onValidate=() => {}]
 */

/**
 * @class FormValidator
 * @param {FormValidatorParams_t} params
 */
export default class FormValidator {
  ignoreValidationResult = false;

  #elementToErrorListMap;

  #form;

  #contextElementToContextMap = new Map();

  #observableToTargetSetMap;

  #onValidate;

  #targetElementToStorageMap;

  #validatorNameToDefinitionMap = new Map();

  constructor({ form, validatorDeclarations = {}, onValidate = () => {} }) {
    if (!(form instanceof HTMLFormElement)) {
      throw new Error('form must be an HTMLFormElement');
    }

    this.#form = form;
    this.#onValidate = onValidate;
    this.#form.setAttribute('novalidate', '');
    this.#form.setAttribute('data-validation-context', '*');
    this.addValidators(validatorDeclarations);
    this.#form.addEventListener('input', this.#inputEventHandler.bind(this));
    this.#form.addEventListener('reset', this.#resetEventHandler.bind(this));
    this.#form.addEventListener('validate', this.#validateEventHandler.bind(this));
  }

  static getElementType(element) {
    const tagName = element.tagName.toLowerCase();

    switch (tagName) {
      case 'input':
        // eslint-disable-next-line no-case-declarations
        const inputType = element.attributes.type.value.toLowerCase();

        switch (inputType) {
          case 'text':
          case 'password':
          case 'tel':
          case 'checkbox':
          case 'radio':
            return inputType;
          // no default
        }

        return null;
      case 'textarea':
      case 'select':
        return tagName;
      // no default
    }

    return null;
  }

  static createValidateEvent({ data = null } = {}) {
    return new CustomEvent('validate', {
      bubbles: true,
      detail: {
        ...data,
      },
    });
  }

  addValidators(validatorDeclarations) {
    Object.keys(validatorDeclarations)
      .forEach((key) => {
        const validatorDeclaration = validatorDeclarations[key] || {};
        const {
          init = element => [element],
          validate = () => ({ isValid: true }),
        } = validatorDeclaration;

        if (typeof init !== 'function' || typeof validate !== 'function') {
          throw new Error('Invalid validator declaration');
        }

        let {
          errorMessage = '',
        } = validatorDeclaration;

        if (typeof errorMessage === 'string') {
          errorMessage = {
            '': errorMessage,
          };
        }

        this.#validatorNameToDefinitionMap.set(key, {
          init,
          validate,
          errorMessage,
        });
      });

    this.updateValidationParameters();

    return this;
  }

  getValidatorNameToArgumentStringMap({ value = '' }) {
    const regExp = /([a-z0-9-_]+)(?:\((.*?)\)(?=[;, ]+))?/gi;
    const validatorNameToArgumentStringMap = new Map();

    let normalizedValue = value;

    if (normalizedValue.length && normalizedValue[normalizedValue.length - 1] !== ';') {
      normalizedValue += ';';
    }

    const validatorParameters = {};

    for (
      let ix = 0, temp = regExp.exec(normalizedValue);
      temp;
      ix += 1, temp = regExp.exec(normalizedValue)
    ) {
      const [, name, argumentString = ''] = temp;

      validatorParameters[name] = {
        ix,
        argumentString,
      };
    }

    Object.keys(validatorParameters)
      .filter(validatorName => this.#validatorNameToDefinitionMap.has(validatorName))
      .sort((a, b) => validatorParameters[a].ix - validatorParameters[b].ix)
      .forEach(validatorName => validatorNameToArgumentStringMap.set(validatorName, validatorParameters[validatorName].argumentString || ''));

    return validatorNameToArgumentStringMap;
  }

  updateValidationParameters() {
    this.#targetElementToStorageMap = new Map();
    this.#elementToErrorListMap = new Map();
    this.#observableToTargetSetMap = new Map();
    this.#buildContextTree(this.#form);
    this.#form.querySelectorAll('[data-validation]')
      .forEach((targetElement) => {
        this.#elementToErrorListMap.set(targetElement, []);

        const {
          validatorNameToContextMap,
          validatorNameToDataMap,
        } = this.#getData(targetElement);
        const validatorNameToArgumentStringMap = this.getValidatorNameToArgumentStringMap(targetElement.attributes['data-validation']);

        validatorNameToArgumentStringMap
          .forEach((argumentString, validatorName) => {
            validatorNameToContextMap
              .set(validatorName, this.#getContext(targetElement, validatorName));
            validatorNameToDataMap
              .set(validatorName, { argumentString });
          });

        Array.from(validatorNameToArgumentStringMap.keys())
          .forEach((validatorNameToExecute) => {
            this.#validatorNameToDefinitionMap.get(validatorNameToExecute)
              .init
              .apply(null, [
                targetElement,
                validatorNameToDataMap.get(validatorNameToExecute),
              ])
              .filter(observable => observable !== targetElement)
              .forEach(observable => this.#addObservableElement(targetElement, observable));
          });
      });
  }

  #addError(element, validationResult) {
    this.#removeError(element, validationResult);
    const errorList = this.#elementToErrorListMap.get(element);
    const {
      validatorName,
    } = validationResult;
    let {
      validatorSubtypeList,
    } = validationResult;

    if (validatorSubtypeList.length === 0) {
      validatorSubtypeList = [''];
    }

    validatorSubtypeList.map(subtype => errorList.push({
      validatorName,
      subtype,
      message: this.#validatorNameToDefinitionMap.get(validatorName).errorMessage[subtype] || null,
    }));
  }

  #addObservableElement(target, observable) {
    if (!this.#observableToTargetSetMap.has(observable)) {
      this.#observableToTargetSetMap.set(observable, new Set());
    }

    const targetSet = this.#observableToTargetSetMap.get(observable);

    targetSet.add(target);
  }

  #buildContextTree(root = null, parent = null) {
    const context = {
      element: root,
      parent,
      validatorNameList: root.attributes['data-validation-context'].value.split(',')
        .map(validatorName => validatorName.trim())
        .filter(validatorName => validatorName.length > 0),
    };

    this.#elementToErrorListMap.set(context.element, []);
    this.#contextElementToContextMap.set(context.element, context);

    context.contextList = Array.from(context.element.querySelectorAll('[data-validation-context]'))
      .filter(descendantContext => descendantContext.parentElement.closest('[data-validation-context]') === context.element)
      .map(childContext => this.#buildContextTree(childContext, context));

    return context;
  }

  #initData(targetElement) {
    this.#targetElementToStorageMap.set(targetElement, {
      validatorNameToContextMap: new Map(),
      validatorNameToDataMap: new Map(),
    });
  }

  #inputEventHandler(event) {
    const { target: targetElement } = event;

    if (this.#targetElementToStorageMap.has(targetElement)) {
      targetElement.dispatchEvent(FormValidator.createValidateEvent());
    }

    if (this.#observableToTargetSetMap.has(targetElement)) {
      this.#observableToTargetSetMap.get(targetElement)
        .forEach((observer) => {
          observer.dispatchEvent(FormValidator.createValidateEvent());
        });
    }
  }

  #getContext(target, validatorName) {
    const closestContextElement = target.closest('[data-validation-context]');
    let context = this.#contextElementToContextMap.get(closestContextElement);

    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (context.validatorNameList.indexOf(validatorName) >= 0 || context.validatorNameList.indexOf('*') >= 0) {
        break;
      }

      context = context.parent;
    }

    return context;
  }

  #getData(targetElement) {
    if (!this.#hasData(targetElement)) {
      this.#initData(targetElement);
    }

    return this.#targetElementToStorageMap.get(targetElement);
  }

  #hasData(targetElement) {
    return this.#targetElementToStorageMap.has(targetElement);
  }

  #removeError(element, validationResult) {
    let errorList = this.#elementToErrorListMap.get(element);

    errorList = errorList.filter(error => error.validatorName !== validationResult.validatorName);

    this.#elementToErrorListMap.set(element, errorList);
  }

  #resetEventHandler(event) {
    if (event.target === this.#form) {
      [...this.#elementToErrorListMap.keys()]
        .forEach((element) => this.#onValidate(element, []));
    }
  }

  #validateEventHandler(event) {
    const { target: targetElement } = event;
    const elementType = FormValidator.getElementType(targetElement);

    if (elementType) {
      const { validatorNameToContextMap, validatorNameToDataMap } = this.#getData(targetElement);
      const validationResultList = Array.from(validatorNameToContextMap)
        .map(([validatorName]) => {
          const data = validatorNameToDataMap.get(validatorName);
          const validationResult = this.#validatorNameToDefinitionMap.get(validatorName)
            .validate
            .apply(null, [
              targetElement,
              data,
            ]);

          if (!(validationResult instanceof FormValidatorValidationResult)) {
            throw new Error('Invalid validation result');
          }

          validationResult.validatorName = validatorName;

          if (this.ignoreValidationResult) {
            return new FormValidatorValidationResult({
              ...validationResult,
              isValid: true,
            });
          }

          return validationResult;
        });

      const elementSet = validationResultList.reduce((elementSet, validationResult) => {
        const {
          isContextError,
          isValid,
          validatorName,
        } = validationResult;

        if (isContextError) {
          const context = this.#getContext(targetElement, validatorName);

          if (isValid) {
            this.#removeError(context.element, validationResult);
          } else {
            this.#addError(context.element, validationResult);
          }

          elementSet.add(context.element);
        } else {
          if (isValid) {
            this.#removeError(targetElement, validationResult);
          } else {
            this.#addError(targetElement, validationResult);
          }

          elementSet.add(targetElement);
        }

        return elementSet;
      }, new Set());


      [...elementSet]
        .forEach((element) => {
          const errorMessageList = this.#elementToErrorListMap.get(element)
            .map(error => error.message)
            .filter(message => message && message.length > 0);

          this.#onValidate(element, errorMessageList);
        });
    }

    event.stopPropagation();
  }
}
