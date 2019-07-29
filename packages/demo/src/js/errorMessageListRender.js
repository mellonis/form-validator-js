export default (element, errorMessageList) => {
  if (errorMessageList.length) {
    element.classList.add('invalid');
  } else {
    element.classList.remove('invalid');
  }

  if (!(element.nextElementSibling && element.nextElementSibling.tagName.toLowerCase() === 'ul')) {
    const ul = document.createElement('ul');

    ul.classList.add('error-message-list');
    element.parentElement.insertBefore(ul, element.nextSibling);
  }

  const ul = element.nextElementSibling;

  while (ul.firstChild) {
    ul.removeChild(ul.firstChild);
  }

  errorMessageList.forEach((errorMessage) => {
    const li = document.createElement('li');

    li.classList.add('error-message-list__item');
    li.textContent = errorMessage;
    ul.appendChild(li);
  });
};
