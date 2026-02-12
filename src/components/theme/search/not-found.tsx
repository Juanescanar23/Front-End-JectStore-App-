import { EventButton } from '@components/common/button/EventButton';
import NotFoundIcon from '@components/common/icons/NotFoundIcon';
const NotFound = ({ msg }: { msg: string }) => {
  return (
    <div className="my-12 px-4 flex flex-col flex-wrap items-center justify-center gap-y-4">
      <div>
        <NotFoundIcon />
      </div>

      <h1 className="mt-4 font-outfit text-2xl sm:text-3xl lg:text-4xl font-semibold">
        ¡Ups! No hay productos disponibles en esta categoría
      </h1>
      <p className="text-black/60 dark:text-white">{msg}</p>
      <EventButton buttonName="Volver al inicio" redirect="/" />
    </div>
  );
};

export default NotFound;
