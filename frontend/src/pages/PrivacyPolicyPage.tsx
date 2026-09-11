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
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-primary-400">Academia Digital 10K</p>
        <h1 className="text-3xl font-bold sm:text-4xl">Política de privacidad</h1>
        <p className="text-dark-400">Última actualización: 13 de agosto de 2026</p>
      </header>

      <Section title="1. Responsable y alcance">
        <p>Academia Digital 10K es responsable del tratamiento de los datos personales utilizados por ALMA, su plataforma de atención, prospección y gestión de relaciones con clientes.</p>
        <p>Esta política explica qué información tratamos, para qué la utilizamos y cómo pueden las personas ejercer sus derechos.</p>
      </Section>

      <Section title="2. Información que tratamos">
        <p>Podemos recibir información que una persona entrega al comunicarse con Academia Digital 10K mediante WhatsApp u otros canales autorizados, incluyendo:</p>
        <ul className="list-disc space-y-2 pl-6">
          <li>Número de teléfono y nombre de perfil disponible.</li>
          <li>Contenido de los mensajes y archivos que la persona decida enviar.</li>
          <li>Datos de contacto, intereses y preferencias proporcionados durante la conversación.</li>
          <li>Información operativa sobre el estado de conversaciones, seguimientos, reuniones y solicitudes de atención humana.</li>
          <li>Datos técnicos necesarios para seguridad, entrega, diagnóstico e idempotencia de mensajes.</li>
        </ul>
      </Section>

      <Section title="3. Finalidades">
        <p>Utilizamos la información para responder solicitudes, brindar información sobre nuestros servicios, gestionar prospectos y clientes, mantener el historial de atención, coordinar reuniones, realizar seguimientos autorizados, transferir conversaciones a personal humano, prevenir fraude y errores, y mejorar la seguridad y calidad del servicio.</p>
        <p>No vendemos datos personales ni los usamos para finalidades incompatibles con esta política.</p>
      </Section>

      <Section title="4. Automatización y atención humana">
        <p>ALMA puede utilizar automatización e inteligencia artificial para preparar o enviar respuestas y organizar información comercial. Una persona puede solicitar atención humana durante la conversación. Las decisiones relevantes no se toman exclusivamente de forma automatizada sin una revisión apropiada.</p>
      </Section>

      <Section title="5. Proveedores y transferencias">
        <p>Podemos utilizar proveedores tecnológicos para alojamiento, base de datos, mensajería oficial de WhatsApp, inteligencia artificial, agenda y videoconferencia. Estos proveedores tratan la información únicamente para prestar sus servicios, conforme a sus condiciones y medidas de seguridad.</p>
        <p>Algunos proveedores pueden operar en otros países. Aplicamos medidas razonables para proteger la información durante su tratamiento y transferencia.</p>
      </Section>

      <Section title="6. Conservación y seguridad">
        <p>Conservamos la información durante el tiempo necesario para atender la relación, cumplir obligaciones aplicables, resolver controversias y mantener la seguridad del servicio. Después se elimina o anonimiza de forma segura.</p>
        <p>Aplicamos controles de acceso, autenticación, cifrado de credenciales, validación de firmas y otras medidas técnicas y organizativas razonables. Ningún sistema puede garantizar seguridad absoluta.</p>
      </Section>

      <Section title="7. Derechos y eliminación de datos">
        <p>Las personas pueden solicitar acceso, corrección, actualización, oposición o eliminación de sus datos escribiendo a <a className="text-primary-400 underline" href="mailto:prospectacionai10k@gmail.com">prospectacionai10k@gmail.com</a>. Para proteger la información, podremos pedir datos razonables para verificar la identidad del solicitante.</p>
        <p>También puedes consultar nuestras <Link className="text-primary-400 underline" to="/eliminacion-datos">instrucciones de eliminación de datos</Link>.</p>
      </Section>

      <Section title="8. Cambios y contacto">
        <p>Podemos actualizar esta política para reflejar cambios legales, operativos o tecnológicos. Publicaremos la fecha de la actualización en esta página.</p>
        <p>Contacto: <a className="text-primary-400 underline" href="mailto:prospectacionai10k@gmail.com">prospectacionai10k@gmail.com</a>.</p>
      </Section>

      <footer className="border-t border-dark-700 pt-6 text-sm text-dark-400">
        <Link className="text-primary-400 hover:text-primary-300" to="/">Volver a ALMA</Link>
      </footer>
    </article>
  </main>
);
