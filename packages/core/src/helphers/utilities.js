function getElementType(element) {
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
        default:
          return null;
      }
    case 'textarea':
    case 'select':
      return tagName;
    default:
      return null;
  }
}

export default { getElementType };
