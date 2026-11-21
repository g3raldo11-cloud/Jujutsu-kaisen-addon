--!strict
-- Sinal simples para eventos entre módulos (sem usar _G).

export type Signal = {
	Connect: (self: Signal, callback: (...any) -> ()) -> () -> (),
	Fire: (self: Signal, ...any) -> (),
}

local Signal = {}

function Signal.new(): Signal
	local handlers: { (...any) -> () } = {}
	local signal = {}

	function signal.Connect(_self: Signal, callback: (...any) -> ()): () -> ()
		table.insert(handlers, callback)
		return function()
			local index = table.find(handlers, callback)
			if index then
				table.remove(handlers, index)
			end
		end
	end

	function signal.Fire(_self: Signal, ...: any)
		for _, handler in table.clone(handlers) do
			task.spawn(handler, ...)
		end
	end

	return (signal :: any) :: Signal
end

return Signal
