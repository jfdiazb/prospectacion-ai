import { Link } from 'react-router-dom';

export const DataDeletionPage = () => (
  <main className="min-h-screen px-4 py-12 text-white sm:px-6 lg:px-8">
    <article className="mx-auto max-w-3xl space-y-8 rounded-[2rem] border border-dark-700 bg-dark-800/90 p-6 shadow-card sm:p-10">
      <header className="space-y-3 border-b border-dark-700 pb-7">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-primary-400">Academia Digital 10K</p>
        <h1 className="text-3xl font-bold">Eliminación de datos</h1>
      </header>

      <div className="space-y-5 leading-7 text-dark-300">
        <p>Para solicitar la eliminación de los datos asociados a tus conversaciones con ALMA, escribe desde tu correo de contacto a <a className="text-primary-400 underline" href="mailto:prospectacionai10k@gmail.com?subject=Solicitud%20de%20eliminaci%C3%B3n%20de%20datos">prospectacionai10k@gmail.com</a> con el asunto <strong className="text-white">Solicitud de eliminación de datos</strong>.</p>
        <p>Indica el número de teléfono o dato de contacto utilizado en la conversación y una descripción breve de la solicitud. No envíes contraseñas, códigos de acceso ni documentos sensibles por correo.</p>
        <p>Confirmaremos la recepción y podremos solicitar información adicional para verificar tu identidad. Una vez verificada, eliminaremos o anonimizaremos los datos que no debamos conservar por obligaciones legales, seguridad o resolución de controversias.</p>
      </div>

      <footer className="flex flex-wrap gap-5 border-t border-dark-700 pt-6 text-sm">
        <Link className="text-primary-400 hover:text-primary-300" to="/privacidad">Consultar política de privacidad</Link>
        <Link className="text-primary-400 hover:text-primary-300" to="/">Volver a ALMA</Link>
      </footer>
    </article>
  </main>
);
