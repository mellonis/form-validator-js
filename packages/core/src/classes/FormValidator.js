import FormValidatorAnswer from './FormValidatorAnswer';

export default class FormValidator {
  constructor({ form, validatorDeclarations = {}, render = () => {} }) {
    if (!(form instanceof HTMLFormElement)) {
      throw new Error('form should be an HTMLFormElement');
    }

    this.form = form;
    this.render = render;
    this.validatorNameToDefinitionMap = new Map();
    this.ignoreValidationResult = false;
    this.contextElementToContextMap = new Map();
    this.targetToStrorageMap = null;
    this.observableToTargetSetMap = null;
    this.elementToErrorListMap = null;
    this.form.setAttribute('novalidate', '');
    this.form.setAttribute('data-validation-context', '*');
    this.addValidators(validatorDeclarations);
    this.form.addEventListener('validate', this.validateHandler.bind(this));
    this.form.addEventListener('input', this.changeHandler.bind(this));
  }

  changeHandler(event) {
    const { target } = event;

    if (this.targetToStrorageMap.has(target)) {
      target.dispatchEvent(FormValidator.createValidateEvent());
    }

    if (this.observableToTargetSetMap.has(target)) {
      this.observableToTargetSetMap.get(target)
        .forEach((observer) => {
          observer.dispatchEvent(FormValidator.createValidateEvent());
        });
    }
  }

  validateHandler(event) {
    const { target } = event;
    const elementType = FormValidator.getElementType(target);

    if (elementType) {
      const { validatorNameToContextMap, validatorNameToDataMap } = this.getData(target);
      const answerList = Array.from(validatorNameToContextMap).map(([validatorName]) => {
        const data = validatorNameToDataMap.get(validatorName);
        const answerProperties = {
          validatorName,
          ...this.validatorNameToDefinitionMap.get(validatorName).validate
            .apply(null, [
              target,
              data,
            ]),
        };

        if (answerProperties.subtype != null) {
          if (typeof answerProperties.subtype === 'string') {
            answerProperties.subtype = [answerProperties.subtype];
          }
        } else {
          answerProperties.subtype = null;
        }

        if (this.ignoreValidationResult) {
          answerProperties.isValid = true;
        }

        return new FormValidatorAnswer(answerProperties);
      });

      const { contextElementSet, controlSet } = answerList.reduce((result, answer) => {
        const {
          isContextError,
          isValid,
          validatorName,
        } = answer;

        if (isContextError) {
          const context = this.getContext(target, validatorName);

          if (isValid) {
            this.removeError(context.element, answer);
          } else {
            this.addError(context.element, answer);
          }

          result.contextElementSet.add(context.element);
        } else {
          if (isValid) {
            this.removeError(target, answer);
          } else {
            this.addError(target, answer);
          }

          result.controlSet.add(target);
        }

        return result;
      }, {
        contextElementSet: new Set(),
        controlSet: new Set(),
      });

      contextElementSet.forEach((contextElement) => {
        this.render(contextElement, this.elementToErrorListMap.get(contextElement)
          .map(error => error.message)
          .filter(message => message && message.length > 0));
      });
      controlSet.forEach((controlElement) => {
        this.render(controlElement, this.elementToErrorListMap.get(controlElement)
          .map(error => error.message)
          .filter(message => message.length > 0));
      });
    }

    event.stopPropagation();
  }

  init() {
    this.clearTargetsData();
    this.clearElementsErrorLists();
    this.clearObservables();
    this.buildContextTree(this.form);
    this.updateValidationParameters();
  }

  hasData(target) {
    return this.targetToStrorageMap.has(target);
  }

  setData(target) {
    this.targetToStrorageMap.set(target, {
      validatorNameToContextMap: new Map(),
      validatorNameToDataMap: new Map(),
    });
  }

  getData(target) {
    if (!this.hasData(target)) {
      this.setData(target);
    }

    return this.targetToStrorageMap.get(target);
  }

  clearTargetsData(target) {
    if (target) {
      this.setData(target);
    } else {
      this.targetToStrorageMap = new Map();
    }
  }

  clearElementsErrorLists() {
    this.elementToErrorListMap = new Map();
  }

  clearObservables() {
    this.observableToTargetSetMap = new Map();
  }

  addObservableElement(target, observable) {
    if (!this.observableToTargetSetMap.has(observable)) {
      this.observableToTargetSetMap.set(observable, new Set());
    }

    const targetSet = this.observableToTargetSetMap.get(observable);

    targetSet.add(target);
  }

  getValidatorNameToArgumentStringMap({ value = '' }) {
    const regExp = /([a-z0-9-_]+)(?:\((.*?)\)(?=[;, ]+))?/gi;
    const result = new Map();

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
      .filter(validatorName => this.validatorNameToDefinitionMap.has(validatorName))
      .sort((a, b) => validatorParameters[a].ix - validatorParameters[b].ix)
      .forEach(validatorName => result.set(validatorName, validatorParameters[validatorName].argumentString || ''));

    return result;
  }

  updateValidationParameters() {
    this.form.querySelectorAll('[data-validation]')
      .forEach((target) => {
        this.elementToErrorListMap.set(target, []);

        const {
          validatorNameToContextMap,
          validatorNameToDataMap,
        } = this.getData(target);
        const validatorNameToArgumentStringMap = this.getValidatorNameToArgumentStringMap(target.attributes['data-validation']);

        validatorNameToArgumentStringMap.forEach((argumentString, validatorName) => {
          validatorNameToContextMap
            .set(validatorName, this.getContext(target, validatorName));
          validatorNameToDataMap
            .set(validatorName, { argumentString });
        });

        Array.from(validatorNameToArgumentStringMap.keys())
          .forEach((validatorNameToExecute) => {
            this.validatorNameToDefinitionMap.get(validatorNameToExecute).init
              .apply(null, [
                target,
                validatorNameToDataMap.get(validatorNameToExecute),
              ])
              .filter(observable => observable !== target)
              .forEach(observable => this.addObservableElement(target, observable));
          });
      });
  }

  buildContextTree(root = null, parent = null) {
    const context = {
      element: root,
      parent,
      validatorNameList: root.attributes['data-validation-context'].value.split(',')
        .map(validatorName => validatorName.trim())
        .filter(validatorName => validatorName.length > 0),
    };

    this.elementToErrorListMap.set(context.element, []);
    this.contextElementToContextMap.set(context.element, context);

    context.contextList = Array.from(context.element.querySelectorAll('[data-validation-context]'))
      .filter(descendantContext => descendantContext.parentElement.closest('[data-validation-context]') === context.element)
      .map(childContext => this.buildContextTree(childContext, context));

    return context;
  }

  getContext(target, validatorName) {
    const closestContextElement = target.closest('[data-validation-context]');
    let context = this.contextElementToContextMap.get(closestContextElement);

    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (context.validatorNameList.indexOf(validatorName) >= 0 || context.validatorNameList.indexOf('*') >= 0) {
        break;
      }

      context = context.parent;
    }

    return context;
  }

  addError(element, answer) {
    this.removeError(element, answer);
    const errorList = this.elementToErrorListMap.get(element);
    const {
      validatorName,
    } = answer;
    let {
      validatorSubtypeList,
    } = answer;

    if (validatorSubtypeList.length === 0) {
      validatorSubtypeList = [''];
    }

    validatorSubtypeList.map(subtype => errorList.push({
      validatorName,
      subtype,
      message: (this.validatorNameToDefinitionMap.get(validatorName).errorMessage || {})[subtype] || null,
    }));
  }

  removeError(element, answer) {
    let errorList = this.elementToErrorListMap.get(element);

    errorList = errorList.filter(error => error.validatorName !== answer.validatorName);

    this.elementToErrorListMap.set(element, errorList);
  }

  addValidators(validatorDeclarations) {
    Object.keys(validatorDeclarations)
      .forEach((key) => {
        const {
          init = element => [element],
          validate,
        } = validatorDeclarations[key];

        if (typeof init !== 'function' || typeof validate !== 'function') {
          throw new Error('Invalid validator declaration');
        }

        let {
          errorMessage = '',
        } = validatorDeclarations[key];

        if (typeof errorMessage === 'string') {
          errorMessage = {
            '': errorMessage,
          };
        }

        this.validatorNameToDefinitionMap.set(key, {
          init,
          validate,
          errorMessage,
        });
      });
    this.init();

    return this;
  }

  static createValidateEvent({ data = null } = {}) {
    return new CustomEvent('validate', {
      bubbles: true,
      detail: {
        ...data,
      },
    });
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
}
