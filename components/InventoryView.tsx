import React from 'react';

const InventoryView = (props) => {
  return (
    <div className="p-4">
      {/* Buscador Mejorado */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="🔍 Buscar..."
          className="border border-blue-500 rounded p-2 bg-gradient-to-r from-blue-500 to-blue-300 text-white"
        />
        <button className="ml-2 bg-red-500 text-white rounded p-2">Limpiar</button>
      </div>

      {/* Organización por Contenedor */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {props.items.map((item, index) => (
          <div className="bg-white shadow-lg rounded p-4" key={item.id}>
            <div className="flex items-center mb-2">
              <span className="bg-gray-200 rounded-full p-1 text-gray-800 mr-2">🏭</span>
              <span className="font-bold">Contenedor #{index + 1}</span>
            </div>
            <div className="flex gap-2">
              {item.chips.map((chip, idx) => (
                <span className={`bg-${chip.color}-500 text-white rounded-full px-2`} key={idx}>{chip.label}</span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Vista Expandible */}
      <table className="min-w-full bg-gray-100">
        <thead className="bg-gray-800 text-white">
          <tr>
            <th className="py-2" colSpan="4">Detalles</th>
          </tr>
          <tr>
            <th className="py-2">Lote</th>
            <th className="py-2">Cantidad</th>
            <th className="py-2">Precio</th>
            <th className="py-2">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {props.items.map((item) => (
            <tr className="hover:bg-blue-100" key={item.id}>
              <td className="py-2 font-bold text-blue-600">{item.lote}</td>
              <td className="py-2 text-center">{item.cantidad}</td>
              <td className="py-2 text-center">{item.precio}</td>
              <td className="py-2 text-center font-bold text-gray-800" style={{ backgroundColor: '#333' }}>{item.subtotal}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Mejor UX */}
      <div className="flex justify-between items-center mt-4">
        <button className="bg-blue-500 rounded p-2 text-white">◀</button>
        <button className="bg-blue-500 rounded p-2 text-white">▶</button>
      </div>
    </div>
  );
};

export default InventoryView;