import { Link, useNavigate } from 'react-router-dom';
import { FormEvent, useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';

const LoginPage = () => {
  const navigate = useNavigate();
  const { login, token, user } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (user) {
      if (user.user_type === 'student') {
        navigate('/student/dashboard', { replace: true });
      } else if (user.user_type === 'trainer') {
        navigate('/trainer-hub', { replace: true });
      } else {
        navigate('/admin/dashboard', { replace: true });
      }
    }
  }, [navigate, user]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await login(email, password);
      navigate('/', { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-100 to-white">
      <div className="w-full max-w-md p-8 space-y-8 bg-white rounded-2xl shadow-md">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">Welcome Back</h1>
          <p className="mt-2 text-sm text-gray-600">Sign in to continue to LAD</p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="relative">
            <input
              id="email"
              name="email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="peer h-10 w-full border-b-2 border-gray-300 text-gray-900 placeholder-transparent focus:outline-none focus:border-indigo-600"
              placeholder="john@doe.com"
            />
            <label
              htmlFor="email"
              className="absolute left-0 -top-3.5 text-gray-600 text-sm transition-all peer-placeholder-shown:text-base peer-placeholder-shown:text-gray-400 peer-placeholder-shown:top-2 peer-focus:-top-3.5 peer-focus:text-gray-600 peer-focus:text-sm"
            >
              Email address
            </label>
          </div>
          <div className="relative mt-6">
            <input
              id="password"
              name="password"
              type="password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="peer h-10 w-full border-b-2 border-gray-300 text-gray-900 placeholder-transparent focus:outline-none focus:border-indigo-600"
              placeholder="Password"
            />
            <label
              htmlFor="password"
              className="absolute left-0 -top-3.5 text-gray-600 text-sm transition-all peer-placeholder-shown:text-base peer-placeholder-shown:text-gray-400 peer-placeholder-shown:top-2 peer-focus:-top-3.5 peer-focus:text-gray-600 peer-focus:text-sm"
            >
              Password
            </label>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <input id="remember-me" name="remember-me" type="checkbox" className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded" />
              <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-900">
                Remember me
              </label>
            </div>
            <div className="text-sm">
              <a href="#" className="font-medium text-indigo-600 hover:text-indigo-500">
                Forgot your password?
              </a>
            </div>
          </div>
          <div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-70"
            >
              {isSubmitting ? 'Signing in...' : 'Sign in'}
            </button>
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </form>
        <p className="text-center text-sm text-gray-600">
          Don't have an account?{' '}
          <Link to="/register" className="font-medium text-indigo-600 hover:text-indigo-500">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
