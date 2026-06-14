import { FormEvent, useState } from 'react';
import { motion } from 'framer-motion';
import { AppLayout } from '@components/AppLayout';
import { Button, Card } from '@components/shared';
import { useAuth } from '@context/AuthContext';

export const ProfilePage = () => {
  const { user, updateProfile, changePassword } = useAuth();
  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [avatar, setAvatar] = useState(user?.avatar ?? '');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [errors, setErrors] = useState<{ fullName?: string; avatar?: string; oldPassword?: string; newPassword?: string }>({});
  const [loading, setLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);

  const validateUrl = (value: string) => {
    if (!value) return true;
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  };

  const handleProfileSave = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    setError('');

    const validationErrors: typeof errors = {};
    if (!fullName.trim()) {
      validationErrors.fullName = 'El nombre completo es obligatorio.';
    }
    if (avatar && !validateUrl(avatar)) {
      validationErrors.avatar = 'Introduce una URL de avatar válida.';
    }

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      setLoading(false);
      return;
    }

    setErrors({});

    try {
      await updateProfile({ fullName, avatar });
      setMessage('Perfil actualizado correctamente.');
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Error al actualizar el perfil.');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = async (e: FormEvent) => {
    e.preventDefault();
    setPasswordLoading(true);
    setMessage('');
    setError('');

    const validationErrors: typeof errors = {};
    if (!oldPassword) {
      validationErrors.oldPassword = 'Ingresa tu contraseña actual.';
    }
    if (!newPassword || newPassword.length < 6) {
      validationErrors.newPassword = 'La nueva contraseña debe tener al menos 6 caracteres.';
    }
    if (oldPassword && newPassword && oldPassword === newPassword) {
      validationErrors.newPassword = 'La nueva contraseña debe ser distinta a la actual.';
    }

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      setPasswordLoading(false);
      return;
    }

    setErrors({});

    try {
      await changePassword(oldPassword, newPassword);
      setMessage('Contraseña actualizada correctamente.');
      setOldPassword('');
      setNewPassword('');
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Error al cambiar la contraseña.');
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <AppLayout title="Perfil" subtitle="Actualiza tu información y gestiona tu seguridad." >
      <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <Card>
          <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
            <div className="space-y-6">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-dark-500">Cuenta</p>
                <h2 className="text-2xl font-semibold text-white">Información personal</h2>
              </div>

              <form onSubmit={handleProfileSave} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-2">Nombre completo</label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    className="w-full rounded-3xl border border-dark-700 bg-dark-900 px-4 py-3 text-white outline-none transition focus:border-primary-500"
                    placeholder="Tu nombre completo"
                  />
                  {errors.fullName && <p className="mt-2 text-sm text-red-400">{errors.fullName}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-2">Avatar (URL)</label>
                  <input
                    type="text"
                    value={avatar}
                    onChange={e => setAvatar(e.target.value)}
                    className="w-full rounded-3xl border border-dark-700 bg-dark-900 px-4 py-3 text-white outline-none transition focus:border-primary-500"
                    placeholder="https://..."
                  />
                  {errors.avatar && <p className="mt-2 text-sm text-red-400">{errors.avatar}</p>}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-3xl bg-dark-900 p-5">
                    <p className="text-sm text-dark-400">Email</p>
                    <p className="mt-2 text-lg font-medium text-white">{user?.email || 'correo@ejemplo.com'}</p>
                  </div>
                  <div className="rounded-3xl bg-dark-900 p-5">
                    <p className="text-sm text-dark-400">Rol</p>
                    <p className="mt-2 text-lg font-medium text-white">{user?.role || 'Usuario'}</p>
                  </div>
                </div>

                {message && <div className="rounded-3xl bg-green-500/10 border border-green-500/20 p-4 text-sm text-green-300">{message}</div>}
                {error && <div className="rounded-3xl bg-red-500/10 border border-red-500/20 p-4 text-sm text-red-300">{error}</div>}

                <Button type="submit" variant="primary" loading={loading}>Guardar cambios</Button>
              </form>
            </div>
          </motion.div>
        </Card>

        <Card>
          <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
            <div className="space-y-6">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-dark-500">Seguridad</p>
                <h2 className="text-2xl font-semibold text-white">Cambiar contraseña</h2>
              </div>

              <form onSubmit={handlePasswordChange} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-2">Contraseña actual</label>
                  <input
                    type="password"
                    value={oldPassword}
                    onChange={e => setOldPassword(e.target.value)}
                    className="w-full rounded-3xl border border-dark-700 bg-dark-900 px-4 py-3 text-white outline-none transition focus:border-primary-500"
                    placeholder="Contraseña actual"
                  />
                  {errors.oldPassword && <p className="mt-2 text-sm text-red-400">{errors.oldPassword}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-2">Nueva contraseña</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    className="w-full rounded-3xl border border-dark-700 bg-dark-900 px-4 py-3 text-white outline-none transition focus:border-primary-500"
                    placeholder="Nueva contraseña"
                  />
                  {errors.newPassword && <p className="mt-2 text-sm text-red-400">{errors.newPassword}</p>}
                </div>
                <Button type="submit" variant="secondary" loading={passwordLoading}>Actualizar contraseña</Button>
              </form>
            </div>
          </motion.div>
        </Card>
      </div>
    </AppLayout>
  );
};
