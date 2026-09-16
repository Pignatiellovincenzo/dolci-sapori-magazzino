const form = document.getElementById('login-form');
const errorMessage = document.getElementById('error-message');
const submitBtn = document.getElementById('submit-btn');

async function redirectIfAlreadyLoggedIn() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    window.location.href = 'dashboard.html';
  }
}

redirectIfAlreadyLoggedIn();

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorMessage.textContent = '';
  submitBtn.disabled = true;
  submitBtn.textContent = 'Accesso in corso...';

  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;

  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });

  if (error) {
    errorMessage.textContent = 'Email o password non corrette.';
    submitBtn.disabled = false;
    submitBtn.textContent = 'Accedi';
    return;
  }

  window.location.href = 'dashboard.html';
});
