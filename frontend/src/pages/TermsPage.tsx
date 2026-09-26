import { Link } from 'react-router-dom';

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="space-y-3">
    <h2 className="text-xl font-semibold text-white">{title}</h2>
    <div className="space-y-3 leading-7 text-dark-300">{children}</div>
  </section>
);

export const TermsPage = () => (
  <main className="min-h-screen px-4 py-12 text-white sm:px-6 lg:px-8">
    <article className="mx-auto max-w-4xl space-y-10 rounded-[2rem] border border-dark-700 bg-dark-800/90 p-6 shadow-card sm:p-10">
      <header className="space-y-4 border-b border-dark-700 pb-8">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-primary-400">
          ALMA Prospect
        </p>
        <h1 className="text-3xl font-bold sm:text-4xl">Términos de Servicio</h1>
        <p className="text-dark-400">Última actualización: 26 de septiembre de 2026</p>
      </header>
      <Section title="1. Responsable y aceptación">
        <p>
          ALMA Prospect es un servicio operado por Academia Digital 10K. Al acceder o utilizar la
          plataforma, la persona usuaria acepta estos términos y declara que cuenta con capacidad y
          autorización para hacerlo.
        </p>
      </Section>
      <Section title="2. Finalidad del servicio">
        <p>
          ALMA Prospect permite organizar conversaciones, prospectos, procesos de calificación,
          tareas y seguimientos relacionados con canales digitales. Las funciones disponibles pueden
          variar según la configuración, el plan y la disponibilidad de proveedores externos.
        </p>
      </Section>
      <Section title="3. Condiciones de uso">
        <p>
          La persona usuaria debe proporcionar información válida, proteger sus credenciales y
          utilizar el servicio de forma lícita. No está permitido vulnerar controles de seguridad,
          acceder a datos ajenos, enviar contenido ilícito o abusivo, suplantar identidades ni
          utilizar la plataforma para comunicaciones no autorizadas.
        </p>
      </Section>
      <Section title="4. Responsabilidades del usuario">
        <p>
          Quien use ALMA Prospect es responsable de contar con las autorizaciones y bases legales
          necesarias para tratar datos y contactar prospectos, revisar las acciones asistidas antes
          de ejecutarlas y cumplir las reglas de los canales utilizados. También debe mantener
          actualizada la información de su cuenta.
        </p>
      </Section>
      <Section title="5. Integraciones y terceros">
        <p>
          La plataforma puede conectarse mediante APIs oficiales con servicios sociales, de
          mensajería, alojamiento, bases de datos, inteligencia artificial, agenda o
          videoconferencia. Cada integración está sujeta a disponibilidad, aprobación, configuración
          y términos del proveedor correspondiente. La mención de una plataforma no implica que una
          integración concreta esté activa o aprobada.
        </p>
      </Section>
      <Section title="6. Disponibilidad y limitaciones">
        <p>
          Trabajamos para mantener un servicio seguro y disponible, pero no garantizamos operación
          ininterrumpida ni resultados comerciales específicos. Las respuestas automatizadas o
          asistidas pueden requerir revisión humana. En la medida permitida por la ley, no
          respondemos por interrupciones o cambios atribuibles a terceros, redes o configuraciones
          ajenas.
        </p>
      </Section>
      <Section title="7. Suspensión y terminación">
        <p>
          Podemos limitar o suspender el acceso cuando exista incumplimiento de estos términos,
          riesgo de seguridad, uso ilegal, requerimiento de una autoridad o indisponibilidad de una
          integración esencial. La persona usuaria puede dejar de utilizar el servicio y solicitar
          la eliminación de sus datos conforme a la Política de Privacidad.
        </p>
      </Section>
      <Section title="8. Propiedad intelectual">
        <p>
          ALMA Prospect, su software, diseño, documentación y marcas pertenecen a Academia Digital
          10K o a sus respectivos licenciantes. Estos términos conceden únicamente un derecho
          limitado de uso del servicio y no transfieren derechos de propiedad intelectual.
        </p>
      </Section>
      <Section title="9. Modificaciones">
        <p>
          Podemos actualizar estos términos para reflejar cambios legales, técnicos u operativos. La
          versión vigente y su fecha se publicarán en esta página. El uso continuado después de una
          actualización supone la aceptación de los términos modificados cuando la ley lo permita.
        </p>
      </Section>
      <Section title="10. Contacto">
        <p>
          Las consultas sobre estos términos pueden enviarse a{' '}
          <a className="text-primary-400 underline" href="mailto:prospectacionai10k@gmail.com">
            prospectacionai10k@gmail.com
          </a>
          .
        </p>
      </Section>
      <footer className="flex flex-wrap gap-5 border-t border-dark-700 pt-6 text-sm">
        <Link className="text-primary-400 hover:text-primary-300" to="/privacy">
          Política de Privacidad
        </Link>
        <Link className="text-primary-400 hover:text-primary-300" to="/">
          Volver a ALMA Prospect
        </Link>
      </footer>
    </article>
  </main>
);
