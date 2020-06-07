import FormValidator from '@form-validator-js/core';
import { required, pattern, checkedCount } from '@form-validator-js/validators';
import '../css/index.scss';
import render from './errorMessageListRender';

const form = document.getElementById('form-1');
const formValidator = new FormValidator({
  form,
  onErrorMessageListChanged: render,
});

formValidator.addValidators({
  required: {
    ...required,
    errorMessage: 'Value is required',
  },
  pattern: {
    ...pattern,
    errorMessage: 'Value is not agree with pattern',
  },
  'checked-count': {
    ...checkedCount,
    errorMessage: 'You mustn\'t select more than two options',
  },
});

const input = form.querySelector('input[type="text"]');

formValidator.elementToSpecificErrorMessageMap.set(input, {
  required: 'This text field must be filled with data',
  pattern: 'put \'aaabbb\' string in this field',
});

form.addEventListener('submit', (event) => {
  // eslint-disable-next-line no-console
  console.warn(event);
  event.preventDefault();
});
