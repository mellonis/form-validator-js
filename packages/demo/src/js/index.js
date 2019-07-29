import FormValidator from '@form-validator-js/core';
import { required, pattern, checkedCount } from '@form-validator-js/validators';
import '../css/index.scss';
import render from './errorMessageListRender';

const form1 = document.getElementById('form-1');
const formValidator = new FormValidator({
  form: form1,
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

form1.addEventListener('submit', (event) => {
  console.warn(event);
  event.preventDefault();
});
