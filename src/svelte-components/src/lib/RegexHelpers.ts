type NumberWithUnit = {
    value: number,
    metric: boolean,
    toMetric: () => number;
}

function numberWithUnitToMetric() {
    return this.metric ? this.value : this.value * 25.4;
}

function isPojo(value) {
    if (value === null || typeof value !== "object") {
        return false;
    }

    return Object.getPrototypeOf(value) === Object.prototype;
}

const fractions = [
    { value: 0.75, formatted: "3/4" },
    { value: 0.625, formatted: "5/8" },
    { value: 0.5, formatted: "1/2" },
    { value: 0.375, formatted: "3/8" },
    { value: 0.25, formatted: "1/4" },
    { value: 0.1875, formatted: "3/16" },
    { value: 0.125, formatted: "1/8" },
    { value: 0.09375, formatted: "3/32" },
    { value: 0.0625, formatted: "1/16" },
    { value: 0.03125, formatted: "1/32" },
];

function formatFraction(value: number) {
    const fraction = fractions.find(f => f.value === value);

    return fraction ? fraction.formatted : value.toString();
}

export const numberWithUnit = {
    regex: /^\s*(?:(\d+)\s*\/\s*(\d+)|(\d*\.\d+)|(\d+(?:\.\d+)?))\s*("|in|inch|inches|mm|millimeters)\s*$/,
    parse: function (str: string) {
        let [, numerator, denominator, decimal1, decimal2, unit]: any = str?.match(numberWithUnit.regex) ?? [];

        numerator = Number.parseFloat(numerator)
        denominator = Number.parseFloat(denominator)
        decimal1 = Number.parseFloat(decimal1)
        decimal2 = Number.parseFloat(decimal2)

        const metric = (unit ?? "").includes("m");

        switch (true) {
            case isFinite(numerator) && isFinite(denominator):
                return {
                    value: numerator / denominator,
                    metric,
                    toMetric: numberWithUnitToMetric
                };

            case isFinite(decimal1) && decimal1 !== 0:
                return {
                    value: decimal1,
                    metric,
                    toMetric: numberWithUnitToMetric
                };

            case isFinite(decimal2) && decimal2 !== 0:
                return {
                    value: decimal2,
                    metric,
                    toMetric: numberWithUnitToMetric
                };

            default:
                return undefined;
        }
    },
    normalize: function (str) {
        const value = this.parse(str);

        switch (true) {
            case !isPojo(value):
                return "";

            case value.metric:
                return `${value.value} mm`

            default:
                return `${formatFraction(value.value)} in`
        }
    }
}
