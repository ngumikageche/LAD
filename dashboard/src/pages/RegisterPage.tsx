import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../api/client';
import { useAuth } from '../auth/AuthContext';

const RegisterPage = () => {
  const { token, user } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [roleId, setRoleId] = useState('');
  const [institutionId, setInstitutionId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setIsSubmitting(true);
    try {
      await apiRequest('/users', {
        method: 'POST',
        token,
        body: {
          name: fullName,
          email,
          phone: phone.trim() ? phone.trim() : null,
          password,
          role_id: roleId,
          institution_id: institutionId.trim() ? institutionId.trim() : null,
        },
      });
      setSuccessMessage('User created successfully.');
      setFullName('');
      setEmail('');
      setPassword('');
      setPhone('');
      setInstitutionId('');
      setRoleId('');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Registration failed';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-100 to-white">
      <div className="w-full max-w-md p-8 space-y-8 bg-white rounded-2xl shadow-md">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">Create User</h1>
          <p className="mt-2 text-sm text-gray-600">Admin-only user registration</p>
        </div>
        {user?.role_name !== 'Admin' ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            Only Admin users can create new accounts.
          </div>
        ) : (
          <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="relative">
            <input
              id="fullname"
              name="fullname"
              type="text"
              required
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              className="peer h-10 w-full border-b-2 border-gray-300 text-gray-900 placeholder-transparent focus:outline-none focus:border-indigo-600"
              placeholder="John Doe"
            />
            <label
              htmlFor="fullname"
              className="absolute left-0 -top-3.5 text-gray-600 text-sm transition-all peer-placeholder-shown:text-base peer-placeholder-shown:text-gray-400 peer-placeholder-shown:top-2 peer-focus:-top-3.5 peer-focus:text-gray-600 peer-focus:text-sm"
            >
              Full Name
            </label>
          </div>
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
              id="phone"
              name="phone"
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className="peer h-10 w-full border-b-2 border-gray-300 text-gray-900 placeholder-transparent focus:outline-none focus:border-indigo-600"
              placeholder="+1 555 123 4567"
            />
            <label
              htmlFor="phone"
              className="absolute left-0 -top-3.5 text-gray-600 text-sm transition-all peer-placeholder-shown:text-base peer-placeholder-shown:text-gray-400 peer-placeholder-shown:top-2 peer-focus:-top-3.5 peer-focus:text-gray-600 peer-focus:text-sm"
            >
              Phone (optional)
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
          <div className="relative mt-6">
            <input
              id="role"
              name="role"
              type="text"
              required
              value={roleId}
              onChange={(event) => setRoleId(event.target.value)}
              className="peer h-10 w-full border-b-2 border-gray-300 text-gray-900 placeholder-transparent focus:outline-none focus:border-indigo-600"
              placeholder="Role ID"
            />
            <label
              htmlFor="role"
              className="absolute left-0 -top-3.5 text-gray-600 text-sm transition-all peer-placeholder-shown:text-base peer-placeholder-shown:text-gray-400 peer-placeholder-shown:top-2 peer-focus:-top-3.5 peer-focus:text-gray-600 peer-focus:text-sm"
            >
              Role ID
            </label>
          </div>
          <div className="relative mt-6">
            <input
              id="institution"
              name="institution"
              type="text"
              value={institutionId}
              onChange={(event) => setInstitutionId(event.target.value)}
              className="peer h-10 w-full border-b-2 border-gray-300 text-gray-900 placeholder-transparent focus:outline-none focus:border-indigo-600"
              placeholder="Institution ID"
            />
            <label
              htmlFor="institution"
              className="absolute left-0 -top-3.5 text-gray-600 text-sm transition-all peer-placeholder-shown:text-base peer-placeholder-shown:text-gray-400 peer-placeholder-shown:top-2 peer-focus:-top-3.5 peer-focus:text-gray-600 peer-focus:text-sm"
            >
              Institution ID (optional)
            </label>
          </div>
          <div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-70"
            >
              {isSubmitting ? 'Creating...' : 'Create user'}
            </button>
          </div>
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            {successMessage ? <p className="text-sm text-emerald-600">{successMessage}</p> : null}
          </form>
        )}
        <p className="text-center text-sm text-gray-600">
          Need to manage users?{' '}
          <Link to="/users" className="font-medium text-indigo-600 hover:text-indigo-500">
            Go to Users
          </Link>
        </p>
      </div>
    </div>
  );
};

export default RegisterPage;
