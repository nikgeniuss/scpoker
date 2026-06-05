import { useState, type Dispatch, type SetStateAction, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Eye, EyeOff, Lock, Mail, User, Check } from 'lucide-react';
import { z } from 'zod';
import toast, { Toaster } from 'react-hot-toast';

import { API_URL } from '../config/api';

const emailSchema = z.string().email('Некорректный email');

interface RegisterForm {
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
}

interface PremiumCardTableProps {
  form: RegisterForm;
  setForm: Dispatch<SetStateAction<RegisterForm>>;
  showPassword: boolean;
  setShowPassword: Dispatch<SetStateAction<boolean>>;
  agree: boolean;
  setAgree: Dispatch<SetStateAction<boolean>>;
  loading: boolean;
  onSubmit: (e: FormEvent) => void;
  navigate: ReturnType<typeof useNavigate>;
}

const PremiumCardTable = ({
  form,
  setForm,
  showPassword,
  setShowPassword,
  agree,
  setAgree,
  loading,
  onSubmit,
  navigate,
}: PremiumCardTableProps) => {
  const strength = (() => {
    const p = form.password || '';
    let s = 0;

    if (p.length > 6) s++;
    if (p.length > 10) s++;
    if (/[A-Z]/.test(p)) s++;
    if (/[0-9]/.test(p)) s++;
    if (/[^A-Za-z0-9]/.test(p)) s++;

    if (s <= 2) return { label: 'Слабый', color: 'bg-red-500', width: '33%' };
    if (s === 3) return { label: 'Средний', color: 'bg-yellow-500', width: '66%' };
    return { label: 'Сильный', color: 'bg-emerald-500', width: '100%' };
  })();

  return (
    <div className="relative min-h-[calc(100dvh-4rem)] overflow-hidden">
      <img
        src="/images/front-reg.png"
        className="absolute inset-0 w-full h-full object-cover"
      />

      <div className="absolute inset-0 bg-black/50" />

      <Toaster position="top-right" />

      <div className="relative z-10 flex min-h-[calc(100dvh-4rem)] items-center justify-center p-4">
        <div className="relative w-full max-w-md">

          {/* CARD */}
          <div className="relative p-8 bg-[#0b0f0c]/90 backdrop-blur-2xl rounded-3xl overflow-hidden">

            {/* GREEN BORDER */}
            <div
              className="absolute inset-0 rounded-3xl pointer-events-none"
              style={{
                border: '2px solid rgba(16,185,129,0.85)',
                boxShadow:
                  '0 0 0 1px rgba(16,185,129,0.2), 0 0 30px rgba(16,185,129,0.25), inset 0 0 15px rgba(16,185,129,0.15)',
              }}
            />

            <div className="relative z-10">

              {/* HEADER */}
              <div className="text-center mb-6">
                <div className="text-3xl font-black text-white flex justify-center items-center gap-2">
                  <span className="text-white/40">♠</span>
                  <span>
                    SK <span className="text-emerald-400">POKER</span>
                  </span>
                </div>

                <div className="text-white/30 text-xs tracking-[0.3em] mt-2">
                  PREMIUM POKER ROOM
                </div>
              </div>

              <h2 className="text-center text-3xl font-bold text-white mb-2">
                Регистрация
              </h2>

              <p className="text-center text-white/40 text-sm mb-7">
                Присоединяйся к лучшим за столом
              </p>

              <form onSubmit={onSubmit} className="space-y-4">

                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={16} />
                  <input
                    placeholder="Имя пользователя"
                    value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 text-white outline-none"
                  />
                </div>

                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={16} />
                  <input
                    placeholder="Email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 text-white outline-none"
                  />
                </div>

                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={16} />

                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Пароль"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-10 text-white outline-none"
                  />

                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>

                {form.password && (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${strength.color}`}
                        style={{ width: strength.width }}
                      />
                    </div>
                    <span className="text-xs text-white/40">{strength.label}</span>
                  </div>
                )}

                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={16} />

                  <input
                    type="password"
                    placeholder="Повтор пароля"
                    value={form.confirmPassword}
                    onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 text-white outline-none"
                  />

                  {form.confirmPassword && form.password === form.confirmPassword && (
                    <Check className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-400" size={16} />
                  )}
                </div>

                <label className="flex gap-2 text-white/40 text-sm pt-2">
                  <input
                    type="checkbox"
                    checked={agree}
                    onChange={(e) => setAgree(e.target.checked)}
                  />
                  Я согласен с правилами и условиями
                </label>

                <button
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-emerald-500 to-green-600 py-3.5 rounded-xl text-white font-bold shadow-lg shadow-emerald-500/30"
                >
                  {loading ? 'Создание...' : 'Создать аккаунт'}
                </button>
              </form>

              <p className="text-center text-white/30 text-sm mt-5">
                Уже есть аккаунт?{' '}
                <span
                  onClick={() => navigate('/login')}
                  className="text-emerald-400 cursor-pointer"
                >
                  Войти
                </span>
              </p>

            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

const RegisterPage = () => {
  const navigate = useNavigate();
  const loginFn = useAuthStore((s) => s.login);

  const [form, setForm] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  const [showPassword, setShowPassword] = useState(false);
  const [agree, setAgree] = useState(false);
  const [loading, setLoading] = useState(false);

  const validate = () => {
    if (!emailSchema.safeParse(form.email).success) {
      toast.error('Некорректный email');
      return false;
    }

    if (form.password !== form.confirmPassword) {
      toast.error('Пароли не совпадают');
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);

    try {
      const res = await fetch(API_URL + '/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: form.username,
          email: form.email,
          password: form.password,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        toast.success('Аккаунт создан');
        loginFn(data.token, data.user);
        navigate('/');
      } else {
        toast.error(data.error || 'Ошибка');
      }
    } catch {
      toast.error('Ошибка сети');
    }

    setLoading(false);
  };

  return (
    <PremiumCardTable
      form={form}
      setForm={setForm}
      showPassword={showPassword}
      setShowPassword={setShowPassword}
      agree={agree}
      setAgree={setAgree}
      loading={loading}
      onSubmit={handleSubmit}
      navigate={navigate}
    />
  );
};

export const Register = RegisterPage;
export default RegisterPage;