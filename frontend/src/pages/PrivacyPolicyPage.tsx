import { Link } from 'react-router-dom';

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="space-y-3">
    <h2 className="text-xl font-semibold text-white">{title}</h2>
    <div className="space-y-3 leading-7 text-dark-300">{children}</div>
  </section>
);

export const PrivacyPolicyPage = () => (
  <main className="min-h-screen px-4 py-12 text-white sm:px-6 lg:px-8">
    <article className="mx-auto max-w-4xl space-y-10 rounded-[2rem] border border-dark-700 bg-dark-800/90 p-6 shadow-card sm:p-10">
      <header className="space-y-4 border-b border-dark-700 pb-8">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-primary-400">
          ALMA Prospect
        </p>
        <h1 className="text-3xl font-bold sm:text-4xl">Política de Privacidad</h1>
        <p className="text-dark-400">Última actualización: 26 de septiembre de 2026</p>
      </header>
      <Section title="1. Responsable del servicio">
        <p>
          Academia Digital 10K es responsable del tratamiento de la información procesada mediante
          ALMA Prospect, una plataforma para gestionar conversaciones, prospectos, calificación y
          seguimiento provenientes de canales digitales.
        </p>
        <p>
          Contacto de privacidad:{' '}
          <a className="text-primary-400 underline" href="mailto:prospectacionai10k@gmail.com">
            prospectacionai10k@gmail.com
          </a>
          .
        </p>
      </Section>
      <Section title="2. Información que procesamos">
        <p>Según el uso y las integraciones autorizadas, podemos procesar:</p>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            Datos de cuenta, identificación y contacto, como nombre, correo, teléfono o
            identificadores de perfil.
          </li>
          <li>
            Contenido de mensajes, comentarios, respuestas y archivos que una persona decida
            compartir.
          </li>
          <li>
            Información sobre prospectos, intereses, calificación, consentimiento, tareas,
            seguimiento y reuniones.
          </li>
          <li>
            Identificadores técnicos de eventos, canal, conversación y cuenta necesarios para
            seguridad, trazabilidad e idempotencia.
          </li>
          <li>
            Registros técnicos limitados, como fechas, estado de procesamiento, errores y datos de
            acceso necesarios para operar y proteger el servicio.
          </li>
        </ul>
      </Section>
      <Section title="3. Finalidades del tratamiento">
        <p>
          Usamos la información para prestar y administrar ALMA Prospect; organizar conversaciones y
          prospectos; atender solicitudes; apoyar procesos de calificación y seguimiento; coordinar
          tareas o reuniones; facilitar revisión humana; mantener seguridad y auditoría; resolver
          errores; cumplir obligaciones aplicables y mejorar el servicio.
        </p>
        <p>
          No vendemos datos personales ni los utilizamos para finalidades incompatibles con esta
          política.
        </p>
      </Section>
      <Section title="4. Integraciones y datos de terceros">
        <p>
          ALMA Prospect puede integrarse mediante APIs oficiales con plataformas sociales, de
          mensajería y otros servicios tecnológicos. Cuando una integración sea configurada y
          autorizada, podremos recibir la información que el proveedor permita y que resulte
          necesaria para la función solicitada.
        </p>
        <p>
          La disponibilidad de una integración depende de la aprobación, permisos y configuración
          del proveedor. La referencia a TikTok u otra plataforma no significa que esa integración
          esté actualmente activa, aprobada o disponible.
        </p>
      </Section>
      <Section title="5. Automatización y revisión humana">
        <p>
          ALMA Prospect puede usar automatización e inteligencia artificial para clasificar
          información, preparar respuestas o apoyar tareas comerciales. Cuando corresponda, las
          acciones relevantes requieren revisión o confirmación humana. Las personas pueden
          solicitar atención humana por los medios de contacto disponibles.
        </p>
      </Section>
      <Section title="6. Almacenamiento y protección">
        <p>
          La información puede almacenarse en infraestructura de proveedores especializados.
          Aplicamos medidas razonables como controles de acceso, autenticación, separación por
          cuenta, protección de credenciales, validación de solicitudes, registro de eventos y
          cifrado cuando corresponde. Ningún sistema ofrece seguridad absoluta.
        </p>
      </Section>
      <Section title="7. Conservación y eliminación">
        <p>
          Conservamos la información solo durante el tiempo necesario para prestar el servicio,
          mantener seguridad y trazabilidad, cumplir obligaciones legales y resolver controversias.
          Después se elimina o anonimiza de forma razonable, salvo que exista una obligación o
          fundamento legítimo para conservarla.
        </p>
        <p>
          Las instrucciones para solicitar eliminación están disponibles en la{' '}
          <Link className="text-primary-400 underline" to="/eliminacion-datos">
            página de eliminación de datos
          </Link>
          .
        </p>
      </Section>
      <Section title="8. Derechos y solicitudes">
        <p>
          Las personas pueden solicitar acceso, corrección, actualización, portabilidad cuando
          aplique, oposición, limitación o eliminación de sus datos escribiendo a{' '}
          <a className="text-primary-400 underline" href="mailto:prospectacionai10k@gmail.com">
            prospectacionai10k@gmail.com
          </a>
          . Podemos solicitar información razonable para verificar identidad y proteger los datos.
        </p>
      </Section>
      <Section title="9. Servicios de terceros">
        <p>
          Los proveedores externos mantienen sus propias condiciones y políticas de privacidad. El
          uso de sus plataformas también se rige por esos documentos. Procuramos utilizar
          proveedores con medidas adecuadas y limitar el tratamiento a lo necesario para prestar el
          servicio.
        </p>
      </Section>
      <Section title="10. Cambios y contacto">
        <p>
          Podemos actualizar esta política para reflejar cambios legales, técnicos u operativos.
          Publicaremos la versión vigente y su fecha en esta página. Para consultas o solicitudes,
          escribe a{' '}
          <a className="text-primary-400 underline" href="mailto:prospectacionai10k@gmail.com">
            prospectacionai10k@gmail.com
          </a>
          .
        </p>
      </Section>
      <footer className="flex flex-wrap gap-5 border-t border-dark-700 pt-6 text-sm">
        <Link className="text-primary-400 hover:text-primary-300" to="/terms">
          Términos de Servicio
        </Link>
        <Link className="text-primary-400 hover:text-primary-300" to="/">
          Volver a ALMA Prospect
        </Link>
      </footer>
    </article>
  </main>
);
