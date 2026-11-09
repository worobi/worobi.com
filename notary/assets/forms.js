'use strict';
(function () {
  document.querySelectorAll('form[data-request-type]').forEach(form => {
    const fields = form.elements;
    const type = form.dataset.requestType;
    const button = form.querySelector('button[type="submit"]');
    const status = form.querySelector('[role="status"]');
    const originalLabel = button.textContent;
    const email = type === 'support' ? 'sos@worobi.com' : 'notary@worobi.com';
    const validate = () => {
      const minimum = (field, count, message) => field.setCustomValidity(field.value.trim().length < count ? message : '');
      if (type === 'support') {
        minimum(fields.name, 2, 'Enter your name using at least 2 characters.');
        minimum(fields.summary, 5, 'Enter a summary using at least 5 characters.');
        minimum(fields.details, 10, 'Enter at least 10 characters describing the issue.');
      } else {
        minimum(fields.first_name, 1, 'Enter your first name.');
        minimum(fields.last_name, 1, 'Enter your last name.');
      }
    };
    form.addEventListener('input', validate);
    form.addEventListener('reset', () => {
      for (const name of ['name', 'summary', 'details', 'first_name', 'last_name']) fields[name]?.setCustomValidity('');
    });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (button.disabled) return;
      validate();
      if (!form.reportValidity()) return;
      const data = type === 'support' ? {
        requestType: 'support', name: fields.name.value.trim(), email: fields.email.value.trim(),
        summary: fields.summary.value.trim(), message: fields.details.value.trim(),
      } : {
        requestType: 'sales', name: [fields.first_name.value.trim(), fields.last_name.value.trim()].join(' '),
        email: fields.email.value.trim(), phone: fields.phone.value.trim(),
        service: fields.service.value, datetime: fields.datetime.value.trim(), message: fields.message.value.trim(),
      };
      button.disabled = true;
      button.textContent = 'Sending…';
      form.setAttribute('aria-busy', 'true');
      status.hidden = true;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 45000);
      try {
        const response = await fetch('/api/requests', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          signal: controller.signal, body: JSON.stringify(data),
        });
        const result = await response.json();
        if (response.ok && result.success === true && result.submissionStatus === 'accepted_for_sending') {
          status.className = 'form-status form-status--success';
          status.textContent = 'Your request was accepted for sending. This does not confirm inbox delivery or an appointment.';
          form.reset();
        } else {
          status.className = 'form-status form-status--error';
          status.textContent = Array.isArray(result.errors) ? result.errors.join(' ') :
            (result.error || 'We could not confirm your request. Your entries are still here. Please email ' + email + ' before submitting again.');
        }
      } catch (_) {
        status.className = 'form-status form-status--error';
        status.textContent = 'We could not confirm whether your request was sent. Your entries are still here. Please email ' + email + ' before submitting again.';
      } finally {
        clearTimeout(timeout);
        form.removeAttribute('aria-busy');
        button.disabled = false;
        button.textContent = originalLabel;
        status.hidden = false;
        status.focus();
      }
    });
    button.disabled = false;
  });
})();
